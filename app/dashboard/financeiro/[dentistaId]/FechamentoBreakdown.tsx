import type { FechamentoMensalResultado } from '@/lib/fechamentoMensal'

export function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function FechamentoBreakdown({ resultado }: { resultado: FechamentoMensalResultado }) {
  if (resultado.tipo === 'branchA')   return <BreakdownBranchA r={resultado} />
  if (resultado.tipo === 'marco')     return <BreakdownMarco r={resultado} />
  if (resultado.tipo === 'diagrama2') return <BreakdownDiagrama2 r={resultado} />
  return <BreakdownDiagrama3 r={resultado} />
}

function BreakdownBranchA({ r }: { r: Extract<FechamentoMensalResultado, { tipo: 'branchA' }> }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="card-sub">Dentista não participa do rateio — split fixo sobre o total de receitas do mês.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-p5">
          <p className="card-label">Total de receitas</p>
          <p className="card-value text-receita">R$ {fmt(r.totalReceitas)}</p>
        </div>
        <div className="card-p5">
          <p className="card-label">Fica com o dentista (50%)</p>
          <p className="card-value text-receita">R$ {fmt(r.valorDentista)}</p>
        </div>
        <div className="card-p5">
          <p className="card-label">Marco Bianchini (20%)</p>
          <p className="card-value">R$ {fmt(r.valorMarco20pct)}</p>
        </div>
        <div className="card-p5">
          <p className="card-label">Pool do rateio (30%)</p>
          <p className="card-value">R$ {fmt(r.poolParticipantes30pct)}</p>
          <p className="card-sub">Dividido entre os participantes do rateio</p>
        </div>
      </div>

      <div className="card-p5">
        <h2 className="widget-title">Despesas do mês</h2>
        {r.despesas.length === 0 ? (
          <p className="empty-text">Nenhuma despesa — sem ajuste no total a acertar.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {r.despesas.map(d => (
              <div key={d.id} className="movimento-item">
                <div className="dot-despesa" />
                <div className="flex-1 min-w-0"><p className="mov-desc">{d.forma}</p></div>
                <p className="text-sm font-medium text-despesa flex-shrink-0">R$ {fmt(d.valor)}</p>
              </div>
            ))}
            <div className="flex justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Metade atribuída a Marco Bianchini / metade subtraída do total do dentista</span>
              <span className="text-sm font-medium">R$ {fmt(r.metadeDespesaMarco)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="card-p5">
        <p className="card-label">Total a acertar com o dentista</p>
        <p className={`card-value ${r.totalAAcertar >= 0 ? 'text-receita' : 'text-despesa'}`}>R$ {fmt(r.totalAAcertar)}</p>
      </div>
    </div>
  )
}

function ListaContribuicoes({ titulo, itens }: { titulo: string; itens: { dentistaId: string; nome: string; valor: number }[] }) {
  return (
    <div className="card-p5">
      <h2 className="widget-title">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="empty-text">Nada neste mês</p>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map(i => (
            <div key={i.dentistaId} className="movimento-item">
              <div className="flex-1 min-w-0"><p className="mov-desc">{i.nome}</p></div>
              <p className="text-sm font-medium text-receita flex-shrink-0">R$ {fmt(i.valor)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ListaDespesas({ titulo, itens, total }: { titulo: string; itens: { id: string; descricao: string; data: string; valor: number }[]; total: number }) {
  return (
    <div className="card-p5">
      <h2 className="widget-title">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="empty-text">Nada neste mês</p>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map(i => {
            const [, m, d] = i.data.split('-')
            return (
              <div key={i.id} className="movimento-item">
                <div className="dot-despesa" />
                <div className="flex-1 min-w-0">
                  <p className="mov-desc">{i.descricao}</p>
                  <p className="mov-meta">{d}/{m}</p>
                </div>
                <p className="text-sm font-medium text-despesa flex-shrink-0">R$ {fmt(i.valor)}</p>
              </div>
            )
          })}
          <div className="flex justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Total</span>
            <span className="text-sm font-semibold text-despesa">R$ {fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownMarco({ r }: { r: Extract<FechamentoMensalResultado, { tipo: 'marco' }> }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="card-sub">
        Marco Bianchini: tudo que entra (rateio dos não-participantes + pagamentos dos demais
        participantes) somado, e tudo que sai (despesas gerais do rateio + outras despesas
        atribuídas a ele no mês) somado.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-p5">
          <p className="card-label">Total entrada</p>
          <p className="card-value text-receita">R$ {fmt(r.totalEntrada)}</p>
        </div>
        <div className="card-p5">
          <p className="card-label">Total saída</p>
          <p className="card-value text-despesa">R$ {fmt(r.totalSaida)}</p>
        </div>
        <div className="card-p5">
          <p className="card-label">Saldo do mês</p>
          <p className={`card-value ${r.saldo >= 0 ? 'text-receita' : 'text-despesa'}`}>R$ {fmt(r.saldo)}</p>
        </div>
      </div>

      <h2 className="widget-title">Entradas</h2>
      <ListaContribuicoes titulo="20% dos dentistas não-participantes" itens={r.de20PctNaoParticipantes} />
      <ListaContribuicoes titulo="Metade das despesas dos dentistas não-participantes" itens={r.deMetadeDespesasNaoParticipantes} />
      <ListaContribuicoes titulo="Pagamentos à clínica de outros participantes do rateio" itens={r.deDiagrama3PagamentosClinica} />

      <h2 className="widget-title">Saídas</h2>
      <ListaDespesas titulo="Despesas Gerais (rateio)" itens={r.despesasGerais} total={r.totalDespesasGerais} />
      <ListaDespesas titulo="Outras Despesas" itens={r.outrasDespesas} total={r.totalOutrasDespesas} />
    </div>
  )
}

function BreakdownDiagrama2({ r }: { r: Extract<FechamentoMensalResultado, { tipo: 'diagrama2' }> }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="card-sub">José Moisés / Raissa — comissão do particular+Celos e rateio calculados separadamente.</p>

      <div className="card-p5">
        <h2 className="widget-title">Comissão do particular + Celos</h2>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Particular + Celos já enviada</span><span>R$ {fmt(r.comissaoParticularECelos)}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Participação a receber (repasses)</span><span>R$ {fmt(r.participacaoAReceber)}</span></div>
          <div className="flex justify-between pt-2 font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
            <span>Resultado</span><span className="text-receita">R$ {fmt(r.comissaoResultado)}</span>
          </div>
        </div>
      </div>

      <div className="card-p5">
        <h2 className="widget-title">Rateio</h2>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Fatia do pool de rateio</span><span>R$ {fmt(r.rateio)}</span></div>
          <div className="flex justify-between pt-2 font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
            <span>Resultado</span><span className="text-receita">R$ {fmt(r.rateioResultado)}</span>
          </div>
        </div>
      </div>

      <div className="card-p5">
        <p className="card-label">Total do fechamento</p>
        <p className="card-value text-receita">R$ {fmt(r.total)}</p>
      </div>

      <p className="card-sub">
        Pool de rateio do mês: R$ {fmt(r.rateioAgregado.poolTotal)} dividido entre {r.rateioAgregado.nParticipantes} participante(s).
      </p>
    </div>
  )
}

function BreakdownDiagrama3({ r }: { r: Extract<FechamentoMensalResultado, { tipo: 'diagrama3' }> }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="card-sub">Participante do rateio — compara o que ele deve à clínica com o que a clínica deve a ele.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-p5">
          <h2 className="widget-title">Soma A — a pagar</h2>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Rateio</span><span>R$ {fmt(r.somaA_rateio)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Repasses enviados</span><span>R$ {fmt(r.somaA_comissaoAPagarRepasses)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Despesas atribuídas</span><span>R$ {fmt(r.somaA_comissaoAPagarDespesas)}</span></div>
            <div className="flex justify-between pt-2 font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
              <span>Soma A</span><span>R$ {fmt(r.somaA)}</span>
            </div>
          </div>
        </div>

        <div className="card-p5">
          <h2 className="widget-title">Soma B — a receber</h2>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Comissões recebidas</span><span>R$ {fmt(r.somaB_comissoesRecebidas)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Faturamento particular (bruto)</span><span>R$ {fmt(r.somaB_faturamentoParticularBruto)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Faturamento particular (líquido)</span><span>R$ {fmt(r.somaB_faturamentoParticularLiquido)}</span></div>
            <div className="flex justify-between pt-2 font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
              <span>Soma B</span><span>R$ {fmt(r.somaB)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-p5">
        <p className="card-label">{r.quemPaga === 'dentista' ? 'Dentista paga à clínica' : 'Clínica paga ao dentista'}</p>
        <p className={`card-value ${r.quemPaga === 'dentista' ? 'text-despesa' : 'text-receita'}`}>R$ {fmt(r.valor)}</p>
      </div>

      <p className="card-sub">
        Pool de rateio do mês: R$ {fmt(r.rateioAgregado.poolTotal)} dividido entre {r.rateioAgregado.nParticipantes} participante(s).
      </p>
    </div>
  )
}
