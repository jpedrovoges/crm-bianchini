'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface LinhaPreview {
  paciente_nome: string
  guia: string
  valor_bruto: number
}

interface Props {
  dentistaId: string
  dentistaNome: string
  mes: number
  ano: number
  onImportado: () => void
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalize(s: string) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function parseCurrency(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const s = String(val).replace(/R\$\s*/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.').trim()
  return parseFloat(s) || 0
}

export default function ImportarCelos({ dentistaId, dentistaNome, mes, ano, onImportado }: Props) {
  const [modal, setModal]             = useState(false)
  const [processando, setProcessando] = useState(false)
  const [salvando, setSalvando]       = useState(false)
  const [erro, setErro]               = useState<string | null>(null)
  const [linhas, setLinhas]           = useState<LinhaPreview[]>([])
  const [pctImpostos, setPctImpostos] = useState('0')
  const [pctDesconto, setPctDesconto] = useState('0')
  const [marcoId, setMarcoId]         = useState<string | null>(null)
  const [marcoNome, setMarcoNome]     = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('dentistas').select('id, nome').eq('ativo', true)
      .then(({ data }) => {
        if (!data) return
        const marco = data.find(d => {
          const n = normalize(d.nome)
          return n.includes('bianchini') || (n.includes('marco') && n.includes('aurelio'))
        })
        if (marco) { setMarcoId(marco.id); setMarcoNome(marco.nome) }
      })
  }, [])

  const impostos = parseFloat(pctImpostos) || 0
  const desconto = parseFloat(pctDesconto) || 0

  function calcLiquido(bruto: number) {
    const aposImposto = bruto * (1 - impostos / 100)
    return aposImposto * (1 - desconto / 100)
  }

  function calcDescontoValor(bruto: number) {
    const aposImposto = bruto * (1 - impostos / 100)
    return aposImposto * (desconto / 100)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessando(true); setErro(null)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', raw: false, dateNF: 'DD/MM/YYYY' })

      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'DD/MM/YYYY' }) as unknown[][]

      let headerIdx = -1, colBenef = -1, colValor = -1

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const cells = rows[i]
        for (let c = 0; c < cells.length; c++) {
          const n = normalize(String(cells[c] ?? ''))
          if (n === 'beneficiario' || n === 'beneficiário') colBenef = c
          if (n === 'valor total')                          colValor = c
        }
        if (colBenef !== -1 && colValor !== -1) { headerIdx = i; break }
      }

      if (headerIdx === -1 || colBenef === -1 || colValor === -1) {
        setErro('Colunas "Beneficiário" e "Valor Total" não encontradas. Verifique o arquivo.')
        setProcessando(false); return
      }

      const result: LinhaPreview[] = []
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const cells = rows[i]
        const nome  = String(cells[colBenef] ?? '').trim()
        const valor = parseCurrency(cells[colValor])
        if (!nome || valor === 0) continue
        result.push({ paciente_nome: nome, guia: String(cells[0] ?? '').trim(), valor_bruto: valor })
      }

      if (result.length === 0) {
        setErro('Nenhuma linha com valor encontrada na planilha.')
        setProcessando(false); return
      }

      setLinhas(result); setModal(true)
    } catch {
      setErro('Erro ao ler o arquivo. Verifique se é um .xlsx válido.')
    }

    setProcessando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function confirmar() {
    if (linhas.length === 0) return
    setSalvando(true); setErro(null)

    const dataFallback = `${ano}-${String(mes + 1).padStart(2,'0')}-28`

    // Lançamentos do próprio dentista (valor líquido)
    const insertsD = linhas.map(l => ({
      tipo:        'receita',
      descricao:   l.paciente_nome,
      valor:       Math.round(calcLiquido(l.valor_bruto) * 100) / 100,
      forma:       'Convênio',
      data:        dataFallback,
      dentista_id: dentistaId,
      categoria:   'procedimento',
      observacao:  l.guia ? `Guia ${l.guia}` : null,
    }))

    const { error: errD } = await supabase.from('lancamentos').insert(insertsD)
    if (errD) { setErro(errD.message); setSalvando(false); return }

    // Um único lançamento acumulado para o dentista que recebe a comissão
    if (marcoId && desconto > 0) {
      const totalComissao = Math.round(
        linhas.reduce((s, l) => s + calcDescontoValor(l.valor_bruto), 0) * 100
      ) / 100
      const primeiroNome = dentistaNome.trim().split(' ')[0]
      const { error: errM } = await supabase.from('lancamentos').insert({
        tipo:        'receita',
        descricao:   `Comissão Celos - ${primeiroNome}`,
        valor:       totalComissao,
        forma:       'Convênio',
        data:        dataFallback,
        dentista_id: marcoId,
        categoria:   'procedimento',
        observacao:  null,
      })
      if (errM) { setErro(errM.message); setSalvando(false); return }
    }

    setSalvando(false); setModal(false); setLinhas([])
    onImportado()
  }

  const totalBruto        = linhas.reduce((s, l) => s + l.valor_bruto, 0)
  const totalLiquido      = linhas.reduce((s, l) => s + calcLiquido(l.valor_bruto), 0)
  const totalDescontoValor = linhas.reduce((s, l) => s + calcDescontoValor(l.valor_bruto), 0)

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={processando}
          className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
        >
          {processando ? 'Lendo planilha...' : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Importar Celos
            </>
          )}
        </button>
        {erro && !modal && <p className="text-xs text-red-400">{erro}</p>}
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 700, width: '95vw' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Importar Celos — {MESES[mes]} {ano}</h3>
                <p className="card-sub mt-0.5">{linhas.length} paciente(s) · Bruto: R$ {fmt(totalBruto)}</p>
              </div>
              <button onClick={() => setModal(false)} className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Deduções */}
            <div className="flex gap-4 mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="flex-1">
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-3)' }}>Impostos (%)</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={pctImpostos}
                  onChange={e => setPctImpostos(e.target.value)}
                  className="input w-full text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-3)' }}>Desconto Dentista (%)</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={pctDesconto}
                  onChange={e => setPctDesconto(e.target.value)}
                  className="input w-full text-sm"
                />
              </div>
              <div className="flex flex-col justify-end pb-1 min-w-0">
                {desconto > 0 && marcoNome ? (
                  <>
                    <p className="text-xs mb-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                      Repasse → {marcoNome}
                    </p>
                    <p className="text-sm font-semibold text-amber-400">R$ {fmt(totalDescontoValor)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>Total descontado</p>
                    <p className="text-sm font-semibold text-despesa">− R$ {fmt(totalBruto - totalLiquido)}</p>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '42vh' }}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Beneficiário</th>
                    <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-3)' }}>Guia</th>
                    <th className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-3)' }}>Bruto</th>
                    <th className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-3)' }}>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 px-2" style={{ color: 'var(--text-1)' }}>{l.paciente_nome}</td>
                      <td className="py-2 px-2 whitespace-nowrap font-mono text-xs" style={{ color: 'var(--text-3)' }}>{l.guia}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                        R$ {fmt(l.valor_bruto)}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold whitespace-nowrap text-receita">
                        R$ {fmt(calcLiquido(l.valor_bruto))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td colSpan={2} className="py-2 px-2 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
                      {linhas.length} lançamento(s) · Convênio
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-xs" style={{ color: 'var(--text-2)' }}>
                      R$ {fmt(totalBruto)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-sm text-receita">
                      R$ {fmt(totalLiquido)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {erro && <p className="text-xs text-red-400 mt-3">{erro}</p>}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(false)} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={confirmar} disabled={salvando} className="btn-primary flex-1 py-2">
                {salvando ? 'Importando...' : `Importar ${linhas.length} lançamentos · R$ ${fmt(totalLiquido)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
