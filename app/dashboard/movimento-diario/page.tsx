'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/app/dashboard/SessionProvider'
import { formatarNome, formatarCpf } from '@/lib/formatarNome'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const FORMAS = ['Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Convênio', 'Elo Saúde', 'Boleto']

type Visao = 'diario' | 'mensal' | 'anual'

type Lancamento = {
  id: string
  data: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  forma: string
  paciente_id: string | null
  pacientes: { nome: string } | null
  destinatario_id: string | null
  destinatarios: { nome: string; tipo: string } | null
  dentista_id: string | null
  dentistas: { nome: string } | null
  dentista_responsavel_id: string | null
  dentistas_responsavel: { nome: string } | null
  nota_fiscal: boolean
  numero_nf: string | null
  categoria: string | null
  observacao: string | null
}

type Paciente     = { id: string; nome: string }
type Destinatario = { id: string; nome: string; tipo: 'dentista' | 'empresa' }
type Dentista     = { id: string; nome: string }

const formVazio = {
  tipo:                   'receita' as 'receita' | 'despesa',
  descricao:              'Procedimento',
  valor:                  '',
  forma:                  'Pix',
  paciente_id:            '',
  destinatario_id:        '',
  dentista_id:            '',
  dentista_responsavel_id:'',
  parcelas:               '1',
  nota_fiscal:            false,
  numero_nf:              '',
  categoria:              'procedimento' as 'venda' | 'procedimento',
  observacao:             '',
}

const formPacienteVazio = {
  nome: '', telefone: '', email: '', cpf: '', data_nascimento: '', observacoes: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
}

function toISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TABS: { key: Visao; label: string }[] = [
  { key: 'diario', label: 'Diário' },
  { key: 'mensal', label: 'Mensal' },
  { key: 'anual',  label: 'Anual'  },
]

export default function MovimentoDiarioPage() {
  const hoje = new Date()
  const [visao, setVisao] = useState<Visao>('diario')
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  // diário
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(hoje.getDate())
  const [lancamentosDia, setLancamentosDia] = useState<Lancamento[]>([])
  const [diasComMovimento, setDiasComMovimento] = useState<Set<string>>(new Set())

  // mensal
  const [lancamentosMes, setLancamentosMes] = useState<Lancamento[]>([])

  // anual
  const [lancamentosAno, setLancamentosAno] = useState<Pick<Lancamento, 'data' | 'tipo' | 'valor'>[]>([])

  // listas
  const [pacientes, setPacientes]         = useState<Paciente[]>([])
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])
  const [listaDentistas, setListaDentistas] = useState<Dentista[]>([])

  // modal principal
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(formVazio)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]       = useState<string | null>(null)

  // modal novo paciente
  const [modalPaciente, setModalPaciente]   = useState(false)
  const [formPaciente, setFormPaciente]     = useState(formPacienteVazio)
  const [salvandoPaciente, setSalvandoPaciente] = useState(false)
  const [buscandoCep, setBuscandoCep]       = useState(false)

  // busca de paciente (autocomplete) no lançamento de receita
  const [buscaPaciente, setBuscaPaciente]       = useState('')
  const [mostrarPacientes, setMostrarPacientes] = useState(false)

  // modal novo destinatário
  const [modalDestinatario, setModalDestinatario]   = useState(false)
  const [formDestinatario, setFormDestinatario]     = useState({ nome: '', tipo: 'dentista' as 'dentista' | 'empresa' })
  const [salvandoDestinatario, setSalvandoDestinatario] = useState(false)

  // edição e confirmação de exclusão
  const [editandoId, setEditandoId]           = useState<string | null>(null)
  const [editandoLancamento, setEditandoLancamento] = useState<Lancamento | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [confirmarLimparDia, setConfirmarLimparDia] = useState(false)

  // edição do número da NF (recepção, apenas dentistas que emitem nota fiscal)
  const [editandoNFId, setEditandoNFId]                 = useState<string | null>(null)
  const [editandoNFLancamento, setEditandoNFLancamento] = useState<Lancamento | null>(null)
  const [formNF, setFormNF]                             = useState('')
  const [salvandoNF, setSalvandoNF]                     = useState(false)
  const [valorProcedimentoNF, setValorProcedimentoNF]   = useState<number | null>(null)

  // adiantamento de parcelas (recepção e admin/gestor, só dentista José Moisés)
  const [confirmandoAdiantarId, setConfirmandoAdiantarId] = useState<string | null>(null)
  const [adiantando, setAdiantando]                       = useState(false)

  const session    = useSession()
  // Edição completa (valor, paciente etc.) via lápis: admin/gestor sempre puderam;
  // recepção também passou a poder, mas foi orientada a usar só em caso extremo —
  // o fluxo normal da recepção é o botão "NF" abaixo, que só toca o número da nota.
  const podeEditarAdmin = session?.role === 'admin' || session?.role === 'gestor'
  const podeEditar      = podeEditarAdmin || session?.role === 'recepcao'

  // Dentistas que emitem nota fiscal e cuja recepção pode preencher o número da NF
  function dentistaEmiteNF(dentistaId: string | null) {
    const nome = listaDentistas.find(d => d.id === dentistaId)?.nome ?? ''
    const norm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return norm.includes('moises') || norm.includes('raissa')
  }

  // José Moisés costuma pedir pra antecipar o restante de uma venda parcelada
  // numa parcela só — recepção também precisa poder fazer isso, não só admin/gestor.
  function dentistaJoseMoises(dentistaId: string | null) {
    const nome = listaDentistas.find(d => d.id === dentistaId)?.nome ?? ''
    const norm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return norm.includes('moises')
  }

  // Parcelas são lançamentos avulsos (sem vínculo em banco), reconhecidos só
  // pelo sufixo "(i/N)" na descrição — ver a montagem de `inserts` em salvar().
  function parseParcela(descricao: string): { base: string; i: number; n: number } | null {
    const m = descricao.match(/^(.*) \((\d+)\/(\d+)\)$/)
    if (!m) return null
    return { base: m[1], i: parseInt(m[2], 10), n: parseInt(m[3], 10) }
  }

  function podeAdiantar(l: Lancamento) {
    if (l.tipo !== 'receita') return false
    if (session?.role !== 'admin' && session?.role !== 'gestor' && session?.role !== 'recepcao') return false
    if (!dentistaJoseMoises(l.dentista_id)) return false
    const p = parseParcela(l.descricao)
    return !!p && p.n > 1 && p.i < p.n
  }

  useEffect(() => {
    supabase.from('pacientes').select('id, nome').order('nome')
      .then(({ data }) => { if (data) setPacientes(data) })
    supabase.from('destinatarios').select('id, nome, tipo').order('nome')
      .then(({ data }) => { if (data) setDestinatarios(data as Destinatario[]) })
    supabase.from('dentistas').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setListaDentistas(data) })
  }, [])

  // dots do calendário
  useEffect(() => {
    const inicio = toISO(ano, mes, 1)
    const fim    = toISO(ano, mes, new Date(ano, mes + 1, 0).getDate())
    supabase.from('lancamentos').select('data').gte('data', inicio).lte('data', fim)
      .then(({ data }) => { if (data) setDiasComMovimento(new Set(data.map(l => l.data))) })
  }, [mes, ano])

  // lançamentos do dia
  useEffect(() => {
    if (visao !== 'diario' || !diaSelecionado) return
    supabase.from('lancamentos')
      .select('*, pacientes(nome), destinatarios(nome, tipo), dentistas_responsavel:dentistas!dentista_responsavel_id(nome)')
      .eq('data', toISO(ano, mes, diaSelecionado))
      .order('created_at')
      .then(({ data }) => { if (data) setLancamentosDia(data as Lancamento[]) })
  }, [diaSelecionado, mes, ano, visao])

  // lançamentos do mês
  useEffect(() => {
    if (visao !== 'mensal') return
    const inicio = toISO(ano, mes, 1)
    const fim    = toISO(ano, mes, new Date(ano, mes + 1, 0).getDate())
    supabase.from('lancamentos')
      .select('*, pacientes(nome), destinatarios(nome, tipo), dentistas_responsavel:dentistas!dentista_responsavel_id(nome)')
      .gte('data', inicio).lte('data', fim)
      .order('data').order('created_at')
      .then(({ data }) => { if (data) setLancamentosMes(data as Lancamento[]) })
  }, [mes, ano, visao])

  // resumo anual
  useEffect(() => {
    if (visao !== 'anual') return
    supabase.from('lancamentos').select('data, tipo, valor')
      .gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`)
      .then(({ data }) => { if (data) setLancamentosAno(data) })
  }, [ano, visao])

  // ── Navegação ──
  function mesAnterior() {
    if (mes === 0) { setMes(11); setAno(a => a - 1) } else setMes(m => m - 1)
    setDiaSelecionado(null); setLancamentosDia([])
  }
  function proximoMes() {
    if (mes === 11) { setMes(0); setAno(a => a + 1) } else setMes(m => m + 1)
    setDiaSelecionado(null); setLancamentosDia([])
  }

  // ── CRUD ──
  // Receita: descrição é sempre derivada automaticamente do nome do paciente
  // (sem campo livre). Despesa: o vínculo (dentista/destinatário) só serve de
  // sugestão inicial — o campo Descrição fica editável para o usuário ajustar.
  function computeDescricao(f: typeof form): string {
    if (f.tipo === 'receita') {
      const paciente = pacientes.find(p => p.id === f.paciente_id)
      if (paciente) return paciente.nome
      const fallback = f.categoria === 'venda' ? 'Venda' : 'Procedimento'
      return f.observacao.trim() || fallback
    }
    const dentista = listaDentistas.find(d => d.id === f.dentista_responsavel_id)
    if (dentista) return `Despesa - ${dentista.nome}`
    const dest = destinatarios.find(d => d.id === f.destinatario_id)
    return dest?.nome ?? 'Despesa'
  }

  // busca (autocomplete) de paciente na receita
  function selecionarPaciente(p: Paciente) {
    setBuscaPaciente(p.nome)
    setMostrarPacientes(false)
    setForm(f => {
      const next = { ...f, paciente_id: p.id }
      return { ...next, descricao: computeDescricao(next) }
    })
  }

  function limparPaciente() {
    setBuscaPaciente('')
    setMostrarPacientes(false)
    setForm(f => {
      const next = { ...f, paciente_id: '', nota_fiscal: false, numero_nf: '' }
      return { ...next, descricao: computeDescricao(next) }
    })
  }

  async function buscarCep(cep: string) {
    const limpo = cep.replace(/\D/g, '')
    if (limpo.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setFormPaciente(f => ({
          ...f,
          endereco: data.logradouro ?? f.endereco,
          bairro: data.bairro ?? f.bairro,
          cidade: data.localidade ?? f.cidade,
          estado: data.uf ?? f.estado,
        }))
      }
    } catch {}
    setBuscandoCep(false)
  }

  function abrirEdicao(l: Lancamento) {
    setErro(null)
    setEditandoId(l.id)
    setEditandoLancamento(l)
    setForm({
      tipo:                    l.tipo,
      descricao:               l.descricao,
      valor:                   String(l.valor),
      forma:                   l.forma,
      paciente_id:             l.paciente_id ?? '',
      destinatario_id:         l.destinatario_id ?? '',
      dentista_id:             l.dentista_id ?? '',
      dentista_responsavel_id: l.dentista_responsavel_id ?? '',
      parcelas:                '1',
      nota_fiscal:             l.nota_fiscal,
      numero_nf:               l.numero_nf ?? '',
      categoria:               (l.categoria as 'venda' | 'procedimento') ?? 'procedimento',
      observacao:              l.observacao ?? '',
    })
    setBuscaPaciente(l.pacientes?.nome ?? '')
    setMostrarPacientes(false)
    setModal(true)
  }

  // Busca os lançamentos-irmãos de uma parcela (mesma venda/despesa: mesmo
  // tipo, paciente/dentista/destinatário e descrição-base "(i/N)"), usado
  // pra mostrar o valor total do procedimento, replicar o número da NF e
  // colar o valor editado nas demais parcelas.
  async function buscarIrmasParcela(l: Lancamento, p: { base: string; i: number; n: number }) {
    let query = supabase.from('lancamentos').select('id, descricao, valor').eq('tipo', l.tipo)
    query = l.dentista_id ? query.eq('dentista_id', l.dentista_id) : query.is('dentista_id', null)
    query = l.paciente_id ? query.eq('paciente_id', l.paciente_id) : query.is('paciente_id', null)
    query = l.dentista_responsavel_id ? query.eq('dentista_responsavel_id', l.dentista_responsavel_id) : query.is('dentista_responsavel_id', null)
    query = l.destinatario_id ? query.eq('destinatario_id', l.destinatario_id) : query.is('destinatario_id', null)
    const { data: candidatos } = await query
    return (candidatos ?? []).filter(c => {
      if (c.id === l.id) return false
      const pc = parseParcela(c.descricao)
      return !!pc && pc.base === p.base && pc.n === p.n
    })
  }

  async function abrirEdicaoNF(l: Lancamento) {
    setEditandoNFId(l.id)
    setEditandoNFLancamento(l)
    setFormNF(l.numero_nf ?? '')
    // Venda parcelada: a NF é feita pelo valor total do procedimento, não
    // pelo valor de uma parcela isolada.
    const p = parseParcela(l.descricao)
    if (!p) { setValorProcedimentoNF(l.valor); return }
    const irmas = await buscarIrmasParcela(l, p)
    setValorProcedimentoNF(Number(l.valor) + irmas.reduce((s, c) => s + Number(c.valor), 0))
  }

  async function salvarNF() {
    if (!editandoNFId || !editandoNFLancamento) return
    setSalvandoNF(true)
    const numero = formNF.trim() || null
    const { error } = await supabase.from('lancamentos').update({ numero_nf: numero }).eq('id', editandoNFId)
    if (error) { setErro(error.message); setSalvandoNF(false); return }

    // Replica o mesmo número de NF pras demais parcelas da venda — a nota é
    // uma só pro procedimento inteiro, mesmo pago em várias parcelas.
    const p = parseParcela(editandoNFLancamento.descricao)
    const idsIrmaos = p ? (await buscarIrmasParcela(editandoNFLancamento, p)).map(c => c.id) : []
    if (idsIrmaos.length) {
      await supabase.from('lancamentos').update({ numero_nf: numero }).in('id', idsIrmaos)
    }

    const idsAtualizados = [editandoNFId, ...idsIrmaos]
    setLancamentosDia(prev => prev.map(l => idsAtualizados.includes(l.id) ? { ...l, numero_nf: numero } : l))
    setLancamentosMes(prev => prev.map(l => idsAtualizados.includes(l.id) ? { ...l, numero_nf: numero } : l))
    setSalvandoNF(false); setEditandoNFId(null); setEditandoNFLancamento(null); setFormNF(''); setValorProcedimentoNF(null)
  }

  // Puxa o valor de todas as parcelas futuras da mesma venda parcelada (mesmo
  // paciente/dentista/descrição-base, índice maior que o desta) para dentro
  // desta, e apaga as demais. As parcelas já passadas (índice menor) não são
  // tocadas.
  async function adiantarParcelas(l: Lancamento, origem: 'dia' | 'mes') {
    const p = parseParcela(l.descricao)
    if (!p) return
    setAdiantando(true)

    let query = supabase.from('lancamentos').select('id, descricao, valor')
      .eq('tipo', 'receita').eq('dentista_id', l.dentista_id as string).gte('data', l.data)
    query = l.paciente_id ? query.eq('paciente_id', l.paciente_id) : query.is('paciente_id', null)
    const { data: candidatos, error: erroBusca } = await query
    if (erroBusca) { setErro(erroBusca.message); setAdiantando(false); setConfirmandoAdiantarId(null); return }

    const futuras = (candidatos ?? []).filter(c => {
      if (c.id === l.id) return false
      const pc = parseParcela(c.descricao)
      return !!pc && pc.base === p.base && pc.n === p.n && pc.i > p.i
    })

    const novoValor     = Math.round((Number(l.valor) + futuras.reduce((s, c) => s + Number(c.valor), 0)) * 100) / 100
    const novaDescricao = `${p.base} (adiantado)`

    if (futuras.length) {
      const { error } = await supabase.from('lancamentos').delete().in('id', futuras.map(f => f.id))
      if (error) { setErro(error.message); setAdiantando(false); setConfirmandoAdiantarId(null); return }
    }
    const { error } = await supabase.from('lancamentos').update({ valor: novoValor, descricao: novaDescricao }).eq('id', l.id)
    if (error) { setErro(error.message); setAdiantando(false); setConfirmandoAdiantarId(null); return }

    const atualiza = (arr: Lancamento[]) => arr.map(x => x.id === l.id ? { ...x, valor: novoValor, descricao: novaDescricao } : x)
    if (origem === 'dia') setLancamentosDia(prev => atualiza(prev))
    else                  setLancamentosMes(prev => atualiza(prev))

    setAdiantando(false); setConfirmandoAdiantarId(null)
  }

  async function salvar() {
    if (!form.descricao || !form.valor || !diaSelecionado) return
    setSalvando(true); setErro(null)

    if (editandoId) {
      const despComDentista = form.tipo === 'despesa' && !!form.dentista_responsavel_id
      const payload = {
        tipo:                    form.tipo,
        descricao:               form.descricao,
        valor:                   parseFloat(form.valor),
        forma:                   despComDentista ? 'Desconto' : form.forma,
        paciente_id:             form.tipo === 'receita' ? (form.paciente_id || null) : null,
        destinatario_id:         form.tipo === 'despesa' && !despComDentista ? (form.destinatario_id || null) : null,
        nota_fiscal:             form.tipo === 'receita' ? form.nota_fiscal : false,
        numero_nf:               form.tipo === 'receita' && form.nota_fiscal && form.numero_nf.trim() ? form.numero_nf.trim() : null,
        categoria:               form.tipo === 'receita' ? form.categoria : null,
        observacao:              form.tipo === 'receita' && form.observacao.trim() ? form.observacao.trim() : null,
        dentista_id:             form.tipo === 'receita' ? (form.dentista_id || null) : null,
        dentista_responsavel_id: despComDentista ? form.dentista_responsavel_id : null,
      }
      const { error } = await supabase.from('lancamentos').update(payload).eq('id', editandoId)
      if (error) { setErro(error.message); setSalvando(false); return }

      // Parcelado: cola o valor editado nas demais parcelas da mesma venda/
      // despesa — o valor corrigido vale pra todas, não só pra essa parcela.
      if (editandoLancamento) {
        const p = parseParcela(editandoLancamento.descricao)
        if (p) {
          const irmas = await buscarIrmasParcela(editandoLancamento, p)
          if (irmas.length) {
            await supabase.from('lancamentos').update({ valor: payload.valor }).in('id', irmas.map(c => c.id))
            const idsIrmaos = irmas.map(c => c.id)
            setLancamentosDia(prev => prev.map(l => idsIrmaos.includes(l.id) ? { ...l, valor: payload.valor } : l))
            setLancamentosMes(prev => prev.map(l => idsIrmaos.includes(l.id) ? { ...l, valor: payload.valor } : l))
          }
        }
      }

      const dataHoje = toISO(ano, mes, diaSelecionado)
      const { data: atualizado } = await supabase.from('lancamentos')
        .select('*, pacientes(nome), destinatarios(nome, tipo), dentistas_responsavel:dentistas!dentista_responsavel_id(nome)')
        .eq('data', dataHoje).order('created_at')
      if (atualizado) setLancamentosDia(atualizado as Lancamento[])
      setEditandoId(null); setEditandoLancamento(null); setForm(formVazio); setBuscaPaciente(''); setSalvando(false); setModal(false)
      return
    }

    const valorTotal  = parseFloat(form.valor)
    const numParcelas = form.forma === 'Cartão Crédito' ? Math.max(1, parseInt(form.parcelas) || 1) : 1
    const valorParc   = parseFloat((valorTotal / numParcelas).toFixed(2))

    const despComDentista = form.tipo === 'despesa' && !!form.dentista_responsavel_id

    const inserts = Array.from({ length: numParcelas }, (_, i) => {
      const tMes     = mes + i
      const tAno     = ano + Math.floor(tMes / 12)
      const tMesNorm = tMes % 12
      const diaFinal = Math.min(diaSelecionado, new Date(tAno, tMesNorm + 1, 0).getDate())
      return {
        data:                    toISO(tAno, tMesNorm, diaFinal),
        tipo:                    form.tipo,
        descricao:               numParcelas > 1 ? `${form.descricao} (${i + 1}/${numParcelas})` : form.descricao,
        valor:                   valorParc,
        forma:                   despComDentista ? 'Desconto' : form.forma,
        paciente_id:             form.tipo === 'receita' ? (form.paciente_id || null) : null,
        destinatario_id:         form.tipo === 'despesa' && !despComDentista ? (form.destinatario_id || null) : null,
        // Parcelado: a nota fiscal é uma só pro procedimento inteiro, então só a
        // 1ª parcela carrega a flag — evita repetir a etiqueta "NF" (e o botão de
        // preencher número) em todas as parcelas com o valor errado (fracionado).
        nota_fiscal:             form.tipo === 'receita' && form.nota_fiscal ? i === 0 : false,
        numero_nf:               form.tipo === 'receita' && form.nota_fiscal && form.numero_nf.trim() ? form.numero_nf.trim() : null,
        categoria:               form.tipo === 'receita' ? form.categoria : null,
        observacao:              form.tipo === 'receita' && form.observacao.trim() ? form.observacao.trim() : null,
        dentista_id:             form.tipo === 'receita' ? (form.dentista_id || null) : null,
        dentista_responsavel_id: despComDentista ? form.dentista_responsavel_id : null,
      }
    })

    const { error } = await supabase.from('lancamentos').insert(inserts)
    if (error) { setErro(error.message); setSalvando(false); return }

    const dataHoje = toISO(ano, mes, diaSelecionado)
    const { data: novo } = await supabase.from('lancamentos')
      .select('*, pacientes(nome), destinatarios(nome, tipo), dentistas_responsavel:dentistas!dentista_responsavel_id(nome)')
      .eq('data', dataHoje).order('created_at')
    if (novo) setLancamentosDia(novo as Lancamento[])

    const prefixMes = `${ano}-${String(mes + 1).padStart(2, '0')}`
    const novoDots  = inserts.filter(l => l.data.startsWith(prefixMes)).map(l => l.data)
    if (novoDots.length) setDiasComMovimento(prev => new Set([...prev, ...novoDots]))

    setForm(formVazio); setBuscaPaciente(''); setSalvando(false); setModal(false)
  }

  async function salvarPaciente() {
    if (!formPaciente.nome.trim()) return
    setSalvandoPaciente(true)
    const { data, error } = await supabase.from('pacientes')
      .insert(formPaciente)
      .select('id, nome').single()
    if (error) { setSalvandoPaciente(false); return }
    setPacientes(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    setForm(f => {
      const next = { ...f, paciente_id: data.id }
      return { ...next, descricao: computeDescricao(next) }
    })
    setBuscaPaciente(data.nome)
    setMostrarPacientes(false)
    setFormPaciente(formPacienteVazio)
    setSalvandoPaciente(false); setModalPaciente(false)
  }

  async function salvarDestinatario() {
    if (!formDestinatario.nome.trim()) return
    setSalvandoDestinatario(true)
    const { data, error } = await supabase.from('destinatarios')
      .insert({ nome: formDestinatario.nome.trim(), tipo: formDestinatario.tipo })
      .select('id, nome, tipo').single()
    if (error) { setSalvandoDestinatario(false); return }
    setDestinatarios(prev => [...prev, data as Destinatario].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    setForm(f => ({ ...f, destinatario_id: data.id }))
    setFormDestinatario({ nome: '', tipo: 'dentista' })
    setSalvandoDestinatario(false); setModalDestinatario(false)
  }

  async function limparDia() {
    if (!diaSelecionado) return
    const ids = lancamentosDia.map(l => l.id)
    await supabase.from('lancamentos').delete().in('id', ids)
    setLancamentosDia([])
    setDiasComMovimento(prev => { const n = new Set(prev); n.delete(toISO(ano, mes, diaSelecionado)); return n })
    setConfirmarLimparDia(false)
    setConfirmandoId(null)
  }

  async function remover(id: string, origem: 'dia' | 'mes') {
    await supabase.from('lancamentos').delete().eq('id', id)
    setConfirmandoId(null)
    if (origem === 'dia') {
      const novos = lancamentosDia.filter(l => l.id !== id)
      setLancamentosDia(novos)
      if (novos.length === 0 && diaSelecionado) {
        setDiasComMovimento(prev => { const n = new Set(prev); n.delete(toISO(ano, mes, diaSelecionado)); return n })
      }
    } else {
      setLancamentosMes(prev => prev.filter(l => l.id !== id))
    }
  }

  // ── Computed ──
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const totalDias   = new Date(ano, mes + 1, 0).getDate()
  const celulas     = Array(primeiroDia).fill(null).concat(Array.from({ length: totalDias }, (_, i) => i + 1))
  const recDia  = lancamentosDia.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const despDia = lancamentosDia.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)

  const mesPorDia = lancamentosMes.reduce<Record<string, Lancamento[]>>((acc, l) => {
    const d = l.data.split('-')[2]; acc[d] = acc[d] ? [...acc[d], l] : [l]; return acc
  }, {})
  const diasMes = Object.keys(mesPorDia).sort()
  const recMes  = lancamentosMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const despMes = lancamentosMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)

  const resumoPorMes = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${ano}-${String(i + 1).padStart(2, '0')}`
    const movs = lancamentosAno.filter(l => l.data?.startsWith(prefix))
    const rec  = movs.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
    const desp = movs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)
    return { mes: i, rec, desp, count: movs.length }
  })
  const recAno  = resumoPorMes.reduce((s, m) => s + m.rec, 0)
  const despAno = resumoPorMes.reduce((s, m) => s + m.desp, 0)

  const dentistas = destinatarios.filter(d => d.tipo === 'dentista')
  const empresas  = destinatarios.filter(d => d.tipo === 'empresa')

  const pacientesFiltrados = pacientes.filter(p => p.nome.toLowerCase().includes(buscaPaciente.trim().toLowerCase()))

  // ── Helpers UI ──
  function SummaryCards({ rec, desp }: { rec: number; desp: number }) {
    return (
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-lg">
        <div className="summary-box"><p className="summary-label">Receitas</p><p className="text-sm font-semibold text-receita">R$ {fmt(rec)}</p></div>
        <div className="summary-box"><p className="summary-label">Despesas</p><p className="text-sm font-semibold text-despesa">R$ {fmt(desp)}</p></div>
        <div className="summary-box">
          <p className="summary-label">Saldo</p>
          <p className={`text-sm font-semibold ${rec - desp >= 0 ? 'text-receita' : 'text-despesa'}`}>R$ {fmt(rec - desp)}</p>
        </div>
      </div>
    )
  }

  function LancamentoRow({ l, onRemove, confirmando, onConfirmar, onCancelar, onEditar, onEditarNF, onAdiantar, confirmandoAdiantar, onConfirmarAdiantar, onCancelarAdiantar }: {
    l: Lancamento
    onRemove?: () => void
    confirmando?: boolean
    onConfirmar?: () => void
    onCancelar?: () => void
    onEditar?: () => void
    onEditarNF?: () => void
    onAdiantar?: () => void
    confirmandoAdiantar?: boolean
    onConfirmarAdiantar?: () => void
    onCancelarAdiantar?: () => void
  }) {
    const vinculo       = l.tipo === 'receita' ? (l.pacientes?.nome ?? null) : (l.destinatarios?.nome ?? null)
    const catLabel      = l.categoria === 'venda' ? 'Venda' : l.categoria === 'procedimento' ? 'Procedimento' : null
    const dentista      = l.tipo === 'receita' ? (listaDentistas.find(d => d.id === l.dentista_id)?.nome ?? null) : null
    const dentResp      = l.tipo === 'despesa' ? (l.dentistas_responsavel?.nome ?? null) : null
    // Tag de convênio/plano na linha do lançamento:
    // - "Celos": lote importado pela planilha (nunca tem paciente vinculado,
    //   o nome vem só como texto), diferente de um "Convênio" avulso lançado
    //   manualmente com um paciente cadastrado selecionado.
    // - "Elo Saúde": forma própria, selecionada manualmente ao lançar a
    //   venda/procedimento na conta da clínica (dentista responsável =
    //   Marco Bianchini); o repasse pro dentista de destino desconta o
    //   imposto de NF (ver financeiro/[dentistaId]/page.tsx).
    // Ambas entram só esporadicamente (não são do dia a dia), por isso
    // ganham destaque visual diferente das demais linhas.
    const tagPlano =
      l.tipo === 'receita' && l.forma === 'Convênio' && !l.paciente_id ? 'Celos' :
      l.tipo === 'receita' && l.forma === 'Elo Saúde' ? 'Elo Saúde' :
      null
    return (
      <div className="rounded-lg border transition-colors flex items-center gap-3 px-3"
        style={{
          borderColor: tagPlano ? 'var(--accent)' : 'var(--border)',
          backgroundColor: tagPlano ? 'var(--accent-soft)' : 'var(--surface)',
          minHeight: '2rem',
        }}>
        <div className={`flex-shrink-0 ${l.tipo === 'receita' ? 'dot-receita' : 'dot-despesa'}`} />
        <div className="flex-1 min-w-0 py-2">
          <p className="text-sm truncate" style={{ color: 'var(--text-1)' }}>{l.descricao}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
            {l.forma}
            {dentista ? ` · ${dentista}` : ''}
            {dentResp ? ` · Resp: ${dentResp}` : ''}
            {catLabel ? ` · ${catLabel}` : ''}
            {vinculo ? ` · ${vinculo}` : ''}
            {l.observacao ? ` · ${l.observacao}` : ''}
            {l.nota_fiscal ? ` · NF${l.numero_nf ? ` ${l.numero_nf}` : ''}` : ''}
          </p>
        </div>
        {tagPlano && (
          <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
            {tagPlano}
          </span>
        )}
        <p className={`text-sm font-medium flex-shrink-0 ${l.tipo === 'receita' ? 'text-receita' : 'text-despesa'}`}>
          {l.tipo === 'receita' ? '+' : '-'} R$ {fmt(l.valor)}
        </p>
        {onEditarNF && !confirmando && !confirmandoAdiantar && (
          <button onClick={onEditarNF} className="nav-icon hover:text-[var(--text-1)] transition-colors flex-shrink-0 text-xs font-semibold" title="Preencher número da NF">
            NF
          </button>
        )}
        {onEditar && !confirmando && !confirmandoAdiantar && (
          <button onClick={onEditar} className="nav-icon hover:text-[var(--text-1)] transition-colors flex-shrink-0" title="Editar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        {onAdiantar && !confirmando && !confirmandoAdiantar && (
          <button onClick={onAdiantar} className="nav-icon hover:text-[var(--text-1)] transition-colors flex-shrink-0" title="Adiantar parcelas restantes">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        )}
        {onAdiantar && confirmandoAdiantar && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onConfirmarAdiantar}
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              Adiantar
            </button>
            <button onClick={onCancelarAdiantar} className="nav-icon hover:text-[var(--text-1)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {onRemove && !confirmando && !confirmandoAdiantar && (
          <button onClick={onConfirmar} className="nav-icon hover:text-red-400 transition-colors flex-shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
        {onRemove && confirmando && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onRemove}
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ backgroundColor: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)', border: '1px solid rgb(239 68 68 / 0.3)' }}>
              Excluir
            </button>
            <button onClick={onCancelar} className="nav-icon hover:text-[var(--text-1)] transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header-row mb-6">
        <div>
          <h1 className="page-title">Movimento</h1>
          <p className="page-subtitle">Registre e visualize movimentações financeiras</p>
        </div>
        <div className="flex gap-1 rounded-lg p-1 border border-[var(--border)]" style={{ backgroundColor: 'var(--surface-muted)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setVisao(t.key)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${visao === t.key ? 'bg-[var(--surface)] text-[var(--text-1)] font-medium' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ DIÁRIO ═══ */}
      {visao === 'diario' && (
        <div className="flex gap-6 flex-wrap">
          <div className="card-p5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <button onClick={mesAnterior} className="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></button>
              <span className="page-title text-sm">{MESES[mes]} {ano}</span>
              <button onClick={proximoMes} className="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
            </div>
            <div className="grid grid-cols-7 mb-2">{DIAS_SEMANA.map(d => <div key={d} className="cal-day-header">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {celulas.map((dia, i) => {
                if (!dia) return <div key={`v-${i}`} />
                const temMovimento = diasComMovimento.has(toISO(ano, mes, dia))
                const isHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
                const isSel  = dia === diaSelecionado
                return (
                  <button key={dia} onClick={() => setDiaSelecionado(dia)} className={`cal-day ${isSel ? 'cal-day-selected' : isHoje ? 'cal-day-today' : ''}`}>
                    {dia}
                    {temMovimento && <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSel ? 'bg-white' : 'bg-emerald-400'}`} />}
                  </button>
                )
              })}
            </div>
          </div>

          {diaSelecionado && (
            <div className="flex-1 min-w-[320px]">
              <div className="card-p5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="widget-title mb-0.5">{diaSelecionado} de {MESES[mes]}</h2>
                    <p className="page-subtitle text-xs">{lancamentosDia.length} movimentação(ões)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lancamentosDia.length > 0 && !confirmarLimparDia && (
                      <button
                        onClick={() => setConfirmarLimparDia(true)}
                        className="nav-icon hover:text-red-400 transition-colors"
                        title="Excluir todos os lançamentos do dia"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    )}
                    {confirmarLimparDia && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={limparDia}
                          className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{ backgroundColor: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)', border: '1px solid rgb(239 68 68 / 0.3)' }}
                        >
                          Excluir tudo
                        </button>
                        <button onClick={() => setConfirmarLimparDia(false)} className="nav-icon hover:text-[var(--text-1)] transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    )}
                    <button onClick={() => { setErro(null); setForm(formVazio); setEditandoLancamento(null); setBuscaPaciente(''); setMostrarPacientes(false); setConfirmarLimparDia(false); setModal(true) }} className="btn-primary px-3 py-1.5">+ Adicionar</button>
                  </div>
                </div>
                {lancamentosDia.length > 0 && <SummaryCards rec={recDia} desp={despDia} />}
                {lancamentosDia.length === 0
                  ? <p className="card-sub text-center py-10">Nenhuma movimentação neste dia</p>
                  : <div className="flex flex-col gap-2">{lancamentosDia.map(l => (
                      <LancamentoRow key={l.id} l={l}
                        onRemove={() => remover(l.id, 'dia')}
                        confirmando={confirmandoId === l.id}
                        onConfirmar={() => setConfirmandoId(l.id)}
                        onCancelar={() => setConfirmandoId(null)}
                        onEditar={podeEditar ? () => abrirEdicao(l) : undefined}
                        onEditarNF={!podeEditarAdmin && session?.role === 'recepcao' && l.tipo === 'receita' && l.nota_fiscal && dentistaEmiteNF(l.dentista_id) ? () => abrirEdicaoNF(l) : undefined}
                        onAdiantar={podeAdiantar(l) && !adiantando ? () => setConfirmandoAdiantarId(l.id) : undefined}
                        confirmandoAdiantar={confirmandoAdiantarId === l.id}
                        onConfirmarAdiantar={() => adiantarParcelas(l, 'dia')}
                        onCancelarAdiantar={() => setConfirmandoAdiantarId(null)}
                      />
                    ))}</div>
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MENSAL ═══ */}
      {visao === 'mensal' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={mesAnterior} className="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></button>
              <span className="page-title text-sm">{MESES[mes]} {ano}</span>
              <button onClick={proximoMes} className="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
            </div>
            <p className="page-subtitle text-xs">{lancamentosMes.length} lançamento(s)</p>
          </div>
          {session?.role !== 'recepcao' && <SummaryCards rec={recMes} desp={despMes} />}
          {lancamentosMes.length === 0
            ? <div className="empty-state"><div className="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg></div><p className="page-subtitle text-sm">Nenhuma movimentação em {MESES[mes]}</p></div>
            : <div className="card-p5 flex flex-col gap-6">
                {diasMes.map(dia => {
                  const movs = mesPorDia[dia]
                  const r = movs.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
                  const d = movs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
                  return (
                    <div key={dia}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest">{parseInt(dia)} de {MESES[mes]}</p>
                        <div className="flex gap-3">
                          {r > 0 && <span className="text-xs text-receita">+R$ {fmt(r)}</span>}
                          {d > 0 && <span className="text-xs text-despesa">-R$ {fmt(d)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">{movs.map(l => (
                        <LancamentoRow key={l.id} l={l}
                          onRemove={() => remover(l.id, 'mes')}
                          confirmando={confirmandoId === l.id}
                          onConfirmar={() => setConfirmandoId(l.id)}
                          onCancelar={() => setConfirmandoId(null)}
                          onEditar={podeEditar ? () => abrirEdicao(l) : undefined}
                          onEditarNF={!podeEditarAdmin && session?.role === 'recepcao' && l.tipo === 'receita' && l.nota_fiscal && dentistaEmiteNF(l.dentista_id) ? () => abrirEdicaoNF(l) : undefined}
                          onAdiantar={podeAdiantar(l) && !adiantando ? () => setConfirmandoAdiantarId(l.id) : undefined}
                          confirmandoAdiantar={confirmandoAdiantarId === l.id}
                          onConfirmarAdiantar={() => adiantarParcelas(l, 'mes')}
                          onCancelarAdiantar={() => setConfirmandoAdiantarId(null)}
                        />
                      ))}</div>
                    </div>
                  )
                })}
              </div>
          }
        </div>
      )}

      {/* ═══ ANUAL ═══ */}
      {visao === 'anual' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setAno(a => a - 1)} className="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></button>
            <span className="page-title text-sm">{ano}</span>
            <button onClick={() => setAno(a => a + 1)} className="btn-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
          </div>
          {session?.role !== 'recepcao' && <SummaryCards rec={recAno} desp={despAno} />}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {resumoPorMes.map(rm => (
              <button key={rm.mes} onClick={() => { setMes(rm.mes); setVisao('mensal') }} className="card-p5 text-left w-full">
                <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">{MESES[rm.mes]}</p>
                {session?.role === 'recepcao'
                  ? <p className="card-sub text-xs">{rm.count} lançamento(s)</p>
                  : rm.count === 0
                  ? <p className="card-sub text-xs">Sem movimentações</p>
                  : <div className="flex flex-col gap-1">
                      {rm.rec  > 0 && <p className="text-xs text-receita">+ R$ {fmt(rm.rec)}</p>}
                      {rm.desp > 0 && <p className="text-xs text-despesa">- R$ {fmt(rm.desp)}</p>}
                      <p className={`text-sm font-semibold mt-1 ${rm.rec - rm.desp >= 0 ? 'text-receita' : 'text-despesa'}`}>R$ {fmt(rm.rec - rm.desp)}</p>
                    </div>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal: Novo Paciente ── */}
      {modalPaciente && (
        <div className="modal-overlay" style={{ zIndex: 60 }}>
          <div className="modal max-w-lg">
            <div className="modal-header">
              <h3 className="modal-title">Novo Paciente</h3>
              <button onClick={() => { setModalPaciente(false); setFormPaciente(formPacienteVazio) }} className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Dados pessoais */}
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Dados pessoais</p>
              <div>
                <label className="form-label">Nome completo <span className="text-red-400">*</span></label>
                <input type="text" value={formPaciente.nome} onChange={e => setFormPaciente(f => ({ ...f, nome: formatarNome(e.target.value) }))}
                  placeholder="Ex: José Silva" className="form-input" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">CPF</label>
                  <input type="text" value={formPaciente.cpf} onChange={e => setFormPaciente(f => ({ ...f, cpf: formatarCpf(e.target.value) }))} maxLength={14} inputMode="numeric"
                    placeholder="000.000.000-00" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Data de Nascimento</label>
                  <input type="date" value={formPaciente.data_nascimento} onChange={e => setFormPaciente(f => ({ ...f, data_nascimento: e.target.value }))}
                    className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Telefone</label>
                  <input type="tel" value={formPaciente.telefone} onChange={e => setFormPaciente(f => ({ ...f, telefone: e.target.value }))}
                    placeholder="(48) 99999-9999" className="form-input" />
                </div>
                <div>
                  <label className="form-label">E-mail</label>
                  <input type="email" value={formPaciente.email} onChange={e => setFormPaciente(f => ({ ...f, email: e.target.value }))}
                    placeholder="jose@email.com" className="form-input" />
                </div>
              </div>

              {/* Endereço */}
              <p className="text-xs font-semibold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>Endereço</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">CEP</label>
                  <div className="relative">
                    <input type="text" value={formPaciente.cep}
                      onChange={e => { setFormPaciente(f => ({ ...f, cep: e.target.value })); buscarCep(e.target.value) }}
                      placeholder="00000-000" className="form-input" maxLength={9} />
                    {buscandoCep && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-3)' }}>buscando...</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="form-label">Estado</label>
                  <input type="text" value={formPaciente.estado} onChange={e => setFormPaciente(f => ({ ...f, estado: e.target.value }))}
                    placeholder="SC" className="form-input" maxLength={2} />
                </div>
              </div>
              <div>
                <label className="form-label">Logradouro</label>
                <input type="text" value={formPaciente.endereco} onChange={e => setFormPaciente(f => ({ ...f, endereco: e.target.value }))}
                  placeholder="Rua, Avenida..." className="form-input" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Número</label>
                  <input type="text" value={formPaciente.numero} onChange={e => setFormPaciente(f => ({ ...f, numero: e.target.value }))}
                    placeholder="123" className="form-input" />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Complemento</label>
                  <input type="text" value={formPaciente.complemento} onChange={e => setFormPaciente(f => ({ ...f, complemento: e.target.value }))}
                    placeholder="Apto, Sala..." className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Bairro</label>
                  <input type="text" value={formPaciente.bairro} onChange={e => setFormPaciente(f => ({ ...f, bairro: e.target.value }))}
                    placeholder="Centro" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Cidade</label>
                  <input type="text" value={formPaciente.cidade} onChange={e => setFormPaciente(f => ({ ...f, cidade: e.target.value }))}
                    placeholder="Florianópolis" className="form-input" />
                </div>
              </div>

              {/* Observações */}
              <p className="text-xs font-semibold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>Clínico</p>
              <div>
                <label className="form-label">Observações</label>
                <textarea value={formPaciente.observacoes} onChange={e => setFormPaciente(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Alergias, observações clínicas..." rows={3} className="form-textarea" />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => { setModalPaciente(false); setFormPaciente(formPacienteVazio) }} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvarPaciente} disabled={!formPaciente.nome.trim() || salvandoPaciente} className="btn-primary flex-1 py-2">
                {salvandoPaciente ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Novo Destinatário ── */}
      {modalDestinatario && (
        <div className="modal-overlay" style={{ zIndex: 60 }}>
          <div className="modal max-w-sm">
            <div className="modal-header">
              <h3 className="modal-title">Novo Destinatário</h3>
              <button onClick={() => setModalDestinatario(false)} className="nav-icon hover:text-red-400 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="form-label">Tipo <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {(['dentista', 'empresa'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setFormDestinatario(f => ({ ...f, tipo: t }))}
                      className={`tipo-btn flex-1 py-1.5 text-xs ${formDestinatario.tipo === t ? 'bg-[var(--surface-muted)] border-[var(--border-hover)] text-[var(--text-1)] font-medium' : ''}`}>
                      {t === 'dentista' ? 'Dentista' : 'Empresa'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Nome <span className="text-red-400">*</span></label>
                <input type="text" value={formDestinatario.nome} onChange={e => setFormDestinatario(f => ({ ...f, nome: e.target.value }))}
                  placeholder={formDestinatario.tipo === 'dentista' ? 'Ex: Dr. Carlos' : 'Ex: Fornecedor Dental'}
                  className="form-input" autoFocus />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalDestinatario(false)} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvarDestinatario} disabled={!formDestinatario.nome.trim() || salvandoDestinatario} className="btn-primary flex-1 py-2">
                {salvandoDestinatario ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Número da Nota Fiscal ── */}
      {editandoNFId && (
        <div className="modal-overlay" style={{ zIndex: 60 }}>
          <div className="modal max-w-sm">
            <div className="modal-header">
              <h3 className="modal-title">Número da Nota Fiscal</h3>
              <button onClick={() => { setEditandoNFId(null); setEditandoNFLancamento(null); setFormNF(''); setValorProcedimentoNF(null) }} className="nav-icon hover:text-red-400 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="mb-4">
              <p className="form-label mb-1">Dentista responsável</p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                {listaDentistas.find(d => d.id === editandoNFLancamento?.dentista_id)?.nome ?? '...'}
              </p>
            </div>
            <div className="mb-4">
              <p className="form-label mb-1">Valor do procedimento</p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                {valorProcedimentoNF === null ? '...' : `R$ ${fmt(valorProcedimentoNF)}`}
              </p>
              {parseParcela(editandoNFLancamento?.descricao ?? '') && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Soma de todas as parcelas — a nota é feita pelo valor total, não pela parcela</p>
              )}
            </div>
            <div>
              <label className="form-label">Número da NF <span className="nav-icon">(opcional)</span></label>
              <input type="text" value={formNF} onChange={e => setFormNF(e.target.value)} placeholder="Ex: 000123" className="form-input" autoFocus />
              {parseParcela(editandoNFLancamento?.descricao ?? '') && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>Esse número será replicado para as demais parcelas desta venda</p>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setEditandoNFId(null); setEditandoNFLancamento(null); setFormNF(''); setValorProcedimentoNF(null) }} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvarNF} disabled={salvandoNF} className="btn-primary flex-1 py-2">
                {salvandoNF ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Nova / Editar Movimentação ── */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{editandoId ? 'Editar Movimentação' : 'Nova Movimentação'}</h3>
              <button onClick={() => { setModal(false); setEditandoId(null); setEditandoLancamento(null) }} className="nav-icon hover:text-red-400 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>

            <div className="flex gap-2 mb-4">
              {(['receita', 'despesa'] as const).map(t => (
                <button key={t}
                  onClick={() => {
                    setBuscaPaciente(''); setMostrarPacientes(false)
                    setForm(f => {
                      const next = { ...f, tipo: t, paciente_id: '', destinatario_id: '', dentista_id: '', dentista_responsavel_id: '', nota_fiscal: false, numero_nf: '', categoria: 'procedimento' as const, observacao: '' }
                      return { ...next, descricao: computeDescricao(next) }
                    })
                  }}
                  className={`tipo-btn ${form.tipo === t ? (t === 'receita' ? 'tipo-receita-active' : 'tipo-despesa-active') : ''}`}>
                  {t === 'receita' ? 'Receita' : 'Despesa'}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="form-label">Valor (R$)</label>
                <input type="number" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" className="form-input" />
              </div>
              {!(form.tipo === 'despesa' && form.dentista_responsavel_id) && (
                <div>
                  <label className="form-label">Forma de Pagamento</label>
                  <select value={form.forma} onChange={e => setForm(f => ({ ...f, forma: e.target.value, parcelas: '1' }))} className="form-select">
                    {FORMAS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              )}
              {form.forma === 'Cartão Crédito' && (
                <div>
                  <label className="form-label">Parcelas</label>
                  <select value={form.parcelas} onChange={e => setForm(f => ({ ...f, parcelas: e.target.value }))} className="form-select">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={String(n)}>
                        {n === 1 ? 'À vista (1x)' : `${n}x${form.valor ? ` de R$ ${(parseFloat(form.valor) / n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}`}
                      </option>
                    ))}
                  </select>
                  {parseInt(form.parcelas) > 1 && (
                    <p className="text-xs text-[var(--text-3)] mt-1.5">Lançado em {form.parcelas} meses a partir de {MESES[mes]}</p>
                  )}
                </div>
              )}

              {/* ── Receita: Categoria + Observação + Paciente + NF ── */}
              {form.tipo === 'receita' && (
                <>
                  <div>
                    <label className="form-label">Categoria</label>
                    <div className="flex gap-2">
                      {(['procedimento', 'venda'] as const).map(cat => (
                        <button key={cat} type="button"
                          onClick={() => setForm(f => {
                            const next = { ...f, categoria: cat, observacao: '' }
                            return { ...next, descricao: computeDescricao(next) }
                          })}
                          className={`tipo-btn flex-1 py-1.5 text-xs ${form.categoria === cat ? 'bg-[var(--surface-muted)] border-[var(--border-hover)] text-[var(--text-1)] font-medium' : ''}`}>
                          {cat === 'procedimento' ? 'Procedimento' : 'Venda'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="form-label">{form.categoria === 'venda' ? 'Especificação' : 'Observação'} <span className="nav-icon">(opcional)</span></label>
                    <input type="text" value={form.observacao}
                      onChange={e => setForm(f => {
                        const next = { ...f, observacao: e.target.value }
                        return { ...next, descricao: computeDescricao(next) }
                      })}
                      placeholder={form.categoria === 'venda' ? 'Ex: Kit de clareamento dental' : 'Ex: Profilaxia + aplicação de flúor'}
                      className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Dentista responsável <span className="nav-icon">(opcional)</span></label>
                    <select value={form.dentista_id}
                      onChange={e => setForm(f => ({ ...f, dentista_id: e.target.value }))}
                      className="form-select">
                      <option value="">— Nenhum —</option>
                      {listaDentistas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="form-label mb-0">Paciente <span className="nav-icon">(opcional)</span></label>
                      <button type="button"
                        onClick={() => { setFormPaciente({ ...formPacienteVazio, nome: formatarNome(buscaPaciente) }); setModalPaciente(true) }}
                        className="text-xs transition-colors" style={{ color: 'var(--accent)' }}>+ Novo paciente</button>
                    </div>
                    <div className="relative">
                      <input type="text" value={buscaPaciente}
                        onChange={e => {
                          const val = e.target.value
                          setBuscaPaciente(val)
                          setMostrarPacientes(true)
                          if (form.paciente_id) {
                            setForm(f => {
                              const next = { ...f, paciente_id: '', nota_fiscal: false, numero_nf: '' }
                              return { ...next, descricao: computeDescricao(next) }
                            })
                          }
                        }}
                        onFocus={() => setMostrarPacientes(true)}
                        onBlur={() => setTimeout(() => setMostrarPacientes(false), 150)}
                        placeholder="Buscar paciente pelo nome..."
                        className="form-input pr-7" />
                      {buscaPaciente && (
                        <button type="button" onMouseDown={limparPaciente}
                          className="absolute right-2 top-1/2 -translate-y-1/2 nav-icon hover:text-red-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                    {mostrarPacientes && (
                      <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border shadow-lg"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                        {pacientesFiltrados.length === 0 ? (
                          <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>Nenhum paciente encontrado</p>
                        ) : (
                          pacientesFiltrados.map(p => (
                            <button key={p.id} type="button"
                              onMouseDown={() => selecionarPaciente(p)}
                              className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-muted)]"
                              style={{ color: 'var(--text-1)' }}>
                              {p.nome}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {form.paciente_id && (
                    <div>
                      <label className="form-label">Nota Fiscal</label>
                      <div className="flex gap-2">
                        {([false, true] as const).map(v => (
                          <button key={String(v)} type="button"
                            onClick={() => setForm(f => ({ ...f, nota_fiscal: v, numero_nf: v ? f.numero_nf : '' }))}
                            className={`tipo-btn flex-1 py-1.5 text-xs ${form.nota_fiscal === v ? 'bg-[var(--surface-muted)] border-[var(--border-hover)] text-[var(--text-1)] font-medium' : ''}`}>
                            {v ? 'Sim' : 'Não'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {form.nota_fiscal && form.paciente_id && (
                    <div>
                      <label className="form-label">Número da Nota Fiscal <span className="nav-icon">(opcional)</span></label>
                      <input type="text" value={form.numero_nf} onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} placeholder="Ex: 000123" className="form-input" />
                    </div>
                  )}
                </>
              )}

              {/* ── Despesa: Dentista responsável ── */}
              {form.tipo === 'despesa' && (
                <div>
                  <label className="form-label">Dentista responsável <span className="nav-icon">(opcional)</span></label>
                  <select
                    value={form.dentista_responsavel_id}
                    onChange={e => setForm(f => {
                      const next = { ...f, dentista_responsavel_id: e.target.value, destinatario_id: '' }
                      return { ...next, descricao: computeDescricao(next) }
                    })}
                    className="form-select">
                    <option value="">— Sem dentista (despesa geral) —</option>
                    {listaDentistas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                  {form.dentista_responsavel_id && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                      Despesa descontada do lucro do dentista. Forma de pagamento não necessária.
                    </p>
                  )}
                </div>
              )}

              {/* ── Despesa: Destinatário (só quando sem dentista responsável) ── */}
              {form.tipo === 'despesa' && !form.dentista_responsavel_id && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="form-label mb-0">Destinatário <span className="nav-icon">(opcional)</span></label>
                    <button type="button" onClick={() => setModalDestinatario(true)} className="text-xs transition-colors" style={{ color: 'var(--accent)' }}>+ Novo</button>
                  </div>
                  <select value={form.destinatario_id} onChange={e => setForm(f => {
                    const next = { ...f, destinatario_id: e.target.value }
                    return { ...next, descricao: computeDescricao(next) }
                  })} className="form-select">
                    <option value="">— Nenhum —</option>
                    {dentistas.length > 0 && (
                      <optgroup label="Dentistas">
                        {dentistas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                      </optgroup>
                    )}
                    {empresas.length > 0 && (
                      <optgroup label="Empresas">
                        {empresas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}

              {/* ── Despesa: Descrição (editável — receita continua automática pelo nome do paciente) ── */}
              {form.tipo === 'despesa' && (
                <div>
                  <label className="form-label">Descrição</label>
                  <input type="text" value={form.descricao}
                    onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Ex: Material de consumo" className="form-input" />
                </div>
              )}
            </div>

            {erro && <p className="text-xs text-red-400 mt-3">{erro}</p>}

            <div className="flex gap-2 mt-5">
              <button onClick={() => { setModal(false); setEditandoId(null); setEditandoLancamento(null) }} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvar} disabled={!form.descricao || !form.valor || salvando} className="btn-primary flex-1 py-2">
                {salvando ? 'Salvando...' : editandoId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
