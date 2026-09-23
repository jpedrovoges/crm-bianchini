import { supabase } from '@/lib/supabase'
import {
  IMPOSTO_NF_PCT,
  COMISSAO_MARCO_PCT,
  RATEIO_DENTISTA_PCT,
  RATEIO_MARCO_PCT,
  RATEIO_PARTICIPANTES_PCT,
} from '@/lib/financeiro'

// Motor de cálculo do fechamento de mês (rateio entre dentistas), modelado
// a partir dos 3 diagramas BPMN do fechamento mensal. Fase 1: só cálculo,
// sem gravação em `fechamentos_mensais` nem trava de mês fechado.

export type DentistaRow = { id: string; nome: string; ativo: boolean; participa_despesas_comuns: boolean }

export type LancamentoCalc = {
  id: string
  data: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  forma: string
  paciente_id: string | null
  dentista_id: string | null
  dentista_responsavel_id: string | null
}

export type RepasseCalc = {
  id: string
  lancamento_id: string
  dentista_origem_id: string | null
  dentista_destino_id: string | null
  valor: number
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

function normalize(s: string) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ── Data efetiva ──
// Mesma regra usada em financeiro/[dentistaId]/page.tsx: no cartão de
// crédito a operadora só repassa 30 dias corridos depois, no débito cai no
// próximo dia útil. O fechamento de mês usa essa data (não a data bruta do
// lançamento) para decidir a que mês um valor pertence.
function toISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function addDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia + dias)
  return toISO(d.getFullYear(), d.getMonth(), d.getDate())
}

function diaSemana(dataISO: string): number {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  return new Date(ano, mes - 1, dia).getDay()
}

function proximoDiaUtil(dataISO: string): string {
  let d = addDias(dataISO, 1)
  while (diaSemana(d) === 0 || diaSemana(d) === 6) d = addDias(d, 1)
  return d
}

export function dataEfetiva(l: { data: string; forma: string }): string {
  if (l.forma === 'Cartão Crédito') return addDias(l.data, 30)
  if (l.forma === 'Cartão Débito') return proximoDiaUtil(l.data)
  return l.data
}

// ── Identificação de dentistas "especiais" ──
// Mesmo padrão de casamento de nome normalizado já usado em ImportarCelos.tsx
// e movimento-diario/page.tsx — sem coluna própria no banco.
export function resolverMarco(dentistas: DentistaRow[]) {
  return dentistas.find(d => {
    const n = normalize(d.nome)
    return n.includes('bianchini') || (n.includes('marco') && n.includes('aurelio'))
  })
}

export function resolverJoseMoises(dentistas: DentistaRow[]) {
  return dentistas.find(d => normalize(d.nome).includes('moises'))
}

export function resolverRaissa(dentistas: DentistaRow[]) {
  return dentistas.find(d => normalize(d.nome).includes('raissa'))
}

export function participantesRateio(dentistas: DentistaRow[]) {
  return dentistas.filter(d => d.ativo && d.participa_despesas_comuns)
}

// Despesa "do" dentista: tanto a lançada diretamente com dentista_id quanto
// a atribuída a ele como responsável (os dois padrões coexistem hoje no
// código real — DespesasComuns usa dentista_id, despesas atribuídas do
// Movimento Diário usam dentista_responsavel_id).
export function despesasDoDentista(lancamentos: LancamentoCalc[], dentistaId: string): LancamentoCalc[] {
  return lancamentos.filter(l => l.tipo === 'despesa' && (l.dentista_id === dentistaId || l.dentista_responsavel_id === dentistaId))
}

// ── Branch A: dentista NÃO participa do rateio ──
export type ResultadoBranchA = {
  totalReceitas: number
  valorDentista: number
  valorMarco20pct: number
  poolParticipantes30pct: number
  despesas: LancamentoCalc[]
  totalDespesas: number
  teveDespesa: boolean
  metadeDespesaMarco: number
  totalAAcertar: number
}

export function calcularBranchA(dentistaId: string, lancamentos: LancamentoCalc[]): ResultadoBranchA {
  const totalReceitas = round2(
    lancamentos.filter(l => l.tipo === 'receita' && l.dentista_id === dentistaId).reduce((s, l) => s + l.valor, 0)
  )
  const valorDentista = round2(totalReceitas * RATEIO_DENTISTA_PCT / 100)
  const valorMarco20pct = round2(totalReceitas * RATEIO_MARCO_PCT / 100)
  const poolParticipantes30pct = round2(totalReceitas * RATEIO_PARTICIPANTES_PCT / 100)

  const despesas = despesasDoDentista(lancamentos, dentistaId)
  const totalDespesas = round2(despesas.reduce((s, l) => s + l.valor, 0))
  const teveDespesa = totalDespesas > 0
  const metadeDespesaMarco = teveDespesa ? round2(totalDespesas / 2) : 0
  const totalAAcertar = round2(valorDentista - metadeDespesaMarco)

  return { totalReceitas, valorDentista, valorMarco20pct, poolParticipantes30pct, despesas, totalDespesas, teveDespesa, metadeDespesaMarco, totalAAcertar }
}

// ── Pool de rateio agregado (todos os não-participantes → todos os participantes) ──
export type RateioAgregado = { poolTotal: number; nParticipantes: number; valorPorParticipante: number }

export function calcularRateioAgregado(dentistas: DentistaRow[], lancamentos: LancamentoCalc[]): RateioAgregado {
  const naoParticipantes = dentistas.filter(d => d.ativo && !d.participa_despesas_comuns)
  const poolTotal = round2(
    naoParticipantes.reduce((s, d) => s + calcularBranchA(d.id, lancamentos).poolParticipantes30pct, 0)
  )
  const nParticipantes = participantesRateio(dentistas).length
  const valorPorParticipante = nParticipantes > 0 ? round2(poolTotal / nParticipantes) : 0
  return { poolTotal, nParticipantes, valorPorParticipante }
}

// ── Diagrama 2: José Moisés / Raissa ──
export function calcularComissaoParticularECelos(lancamentos: LancamentoCalc[], dentistaId: string): number {
  const particular = lancamentos
    .filter(l => l.tipo === 'receita' && l.dentista_id === dentistaId && l.forma !== 'Convênio')
    .reduce((s, l) => s + l.valor, 0)
  // Lote da Celos: receita de convênio sem paciente vinculado (mesma
  // convenção usada pra identificar a tag "Celos" no Movimento Diário).
  const celosJaEnviada = lancamentos
    .filter(l => l.tipo === 'receita' && l.dentista_id === dentistaId && l.forma === 'Convênio' && !l.paciente_id)
    .reduce((s, l) => s + l.valor, 0)
  return round2(particular + celosJaEnviada)
}

export type ResultadoDiagrama2 = {
  comissaoParticularECelos: number
  participacaoAReceber: number
  comissaoResultado: number
  rateio: number
  rateioResultado: number
  total: number
}

export function calcularDiagrama2(
  dentistaId: string,
  lancamentos: LancamentoCalc[],
  repasses: RepasseCalc[],
  rateioValorParticipante: number,
): ResultadoDiagrama2 {
  const comissaoParticularECelos = calcularComissaoParticularECelos(lancamentos, dentistaId)
  const participacaoAReceber = round2(
    repasses.filter(r => r.dentista_destino_id === dentistaId).reduce((s, r) => s + r.valor, 0)
  )

  // Gateway "Tem participação a receber?": se sim, o valor da participação é
  // subtraído da comissão (particular + Celos); se não, paga cheio.
  const comissaoResultado = participacaoAReceber > 0
    ? round2(comissaoParticularECelos - participacaoAReceber)
    : comissaoParticularECelos

  // Gateway "Teve comissão a receber de outros dentistas?": se sim, o valor
  // do rateio é subtraído do total de comissão a receber; se não, o rateio
  // é pago cheio, à parte.
  const rateioResultado = participacaoAReceber > 0
    ? round2(participacaoAReceber - rateioValorParticipante)
    : rateioValorParticipante

  return {
    comissaoParticularECelos,
    participacaoAReceber,
    comissaoResultado,
    rateio: rateioValorParticipante,
    rateioResultado,
    total: round2(comissaoResultado + rateioResultado),
  }
}

// ── Diagrama 3: Nicole / demais participantes do rateio ──
export type ResultadoDiagrama3 = {
  somaA_rateio: number
  somaA_comissaoAPagarRepasses: number
  somaA_comissaoAPagarDespesas: number
  somaA_comissaoAPagar: number
  somaA: number
  somaB_comissoesRecebidas: number
  somaB_faturamentoParticularBruto: number
  somaB_faturamentoParticularLiquido: number
  somaB: number
  quemPaga: 'dentista' | 'clinica'
  valor: number
}

export function calcularDiagrama3(
  dentistaId: string,
  lancamentos: LancamentoCalc[],
  repasses: RepasseCalc[],
  rateioValorParticipante: number,
): ResultadoDiagrama3 {
  const somaA_comissaoAPagarRepasses = round2(
    repasses.filter(r => r.dentista_origem_id === dentistaId).reduce((s, r) => s + r.valor, 0)
  )
  const somaA_comissaoAPagarDespesas = round2(
    despesasDoDentista(lancamentos, dentistaId).reduce((s, l) => s + l.valor, 0)
  )
  const somaA_comissaoAPagar = round2(somaA_comissaoAPagarRepasses + somaA_comissaoAPagarDespesas)
  const somaA = round2(rateioValorParticipante + somaA_comissaoAPagar)

  const somaB_comissoesRecebidas = round2(
    repasses.filter(r => r.dentista_destino_id === dentistaId).reduce((s, r) => s + r.valor, 0)
  )
  const somaB_faturamentoParticularBruto = round2(
    lancamentos
      .filter(l => l.tipo === 'receita' && l.dentista_id === dentistaId && l.forma !== 'Convênio')
      .reduce((s, l) => s + l.valor, 0)
  )
  // Faturamento particular líquido: descontos aplicados em sequência
  // (mesmo padrão de calcLiquido() em ImportarCelos.tsx), não somados.
  const somaB_faturamentoParticularLiquido = round2(
    somaB_faturamentoParticularBruto * (1 - IMPOSTO_NF_PCT / 100) * (1 - COMISSAO_MARCO_PCT / 100)
  )
  const somaB = round2(somaB_comissoesRecebidas + somaB_faturamentoParticularLiquido)

  const quemPaga: 'dentista' | 'clinica' = somaA > somaB ? 'dentista' : 'clinica'
  const valor = round2(Math.abs(somaA - somaB))

  return {
    somaA_rateio: rateioValorParticipante,
    somaA_comissaoAPagarRepasses,
    somaA_comissaoAPagarDespesas,
    somaA_comissaoAPagar,
    somaA,
    somaB_comissoesRecebidas,
    somaB_faturamentoParticularBruto,
    somaB_faturamentoParticularLiquido,
    somaB,
    quemPaga,
    valor,
  }
}

// ── Marco Bianchini: "só recebe os dinheiros" ──
// Escopo simplificado da fase 1 (ver plano): soma o que vem dos dentistas
// não-participantes (20% + metade das despesas) e o que os demais
// participantes do rateio (via Diagrama 3) precisam pagar à clínica no mês.
// Diagrama 2 (José Moisés/Raissa) não tem um passo explícito de "envia pro
// Marco" no fluxo descrito, então não entra aqui.
export type ContribuicaoMarco = { dentistaId: string; nome: string; valor: number }
export type DespesaMarco = { id: string; descricao: string; valor: number; data: string }

export type ResultadoMarco = {
  de20PctNaoParticipantes: ContribuicaoMarco[]
  deMetadeDespesasNaoParticipantes: ContribuicaoMarco[]
  deDiagrama3PagamentosClinica: ContribuicaoMarco[]
  totalEntrada: number
  // "Despesas Gerais" = a fatia do próprio Marco no rateio das despesas
  // comuns (lançada com forma 'Interno' pelo fechamento da aba Despesas
  // Comuns). "Outras Despesas" = despesas avulsas do mês atribuídas a ele
  // (Movimento Diário), fora do rateio.
  despesasGerais: DespesaMarco[]
  totalDespesasGerais: number
  outrasDespesas: DespesaMarco[]
  totalOutrasDespesas: number
  totalSaida: number
  saldo: number
}

export function calcularMarcoRecebeOsDinheiros(
  dentistas: DentistaRow[],
  lancamentos: LancamentoCalc[],
  repasses: RepasseCalc[],
): ResultadoMarco {
  const marco = resolverMarco(dentistas)
  const joseMoises = resolverJoseMoises(dentistas)
  const raissa = resolverRaissa(dentistas)

  const naoParticipantes = dentistas.filter(d => d.ativo && !d.participa_despesas_comuns)

  const de20PctNaoParticipantes = naoParticipantes
    .map(d => ({ dentistaId: d.id, nome: d.nome, valor: calcularBranchA(d.id, lancamentos).valorMarco20pct }))
    .filter(c => c.valor > 0)

  const deMetadeDespesasNaoParticipantes = naoParticipantes
    .map(d => ({ dentistaId: d.id, nome: d.nome, valor: calcularBranchA(d.id, lancamentos).metadeDespesaMarco }))
    .filter(c => c.valor > 0)

  const rateioAgregado = calcularRateioAgregado(dentistas, lancamentos)
  const outrosParticipantes = participantesRateio(dentistas).filter(d =>
    d.id !== marco?.id && d.id !== joseMoises?.id && d.id !== raissa?.id
  )
  const deDiagrama3PagamentosClinica = outrosParticipantes
    .map(d => {
      const r = calcularDiagrama3(d.id, lancamentos, repasses, rateioAgregado.valorPorParticipante)
      return { dentistaId: d.id, nome: d.nome, valor: r.quemPaga === 'dentista' ? r.valor : 0 }
    })
    .filter(c => c.valor > 0)

  const totalEntrada = round2(
    de20PctNaoParticipantes.reduce((s, c) => s + c.valor, 0) +
    deMetadeDespesasNaoParticipantes.reduce((s, c) => s + c.valor, 0) +
    deDiagrama3PagamentosClinica.reduce((s, c) => s + c.valor, 0)
  )

  const despesasDeMarco = marco ? despesasDoDentista(lancamentos, marco.id) : []
  const despesasGerais = despesasDeMarco
    .filter(l => l.forma === 'Interno')
    .map(l => ({ id: l.id, descricao: l.descricao, valor: l.valor, data: l.data }))
  const outrasDespesas = despesasDeMarco
    .filter(l => l.forma !== 'Interno')
    .map(l => ({ id: l.id, descricao: l.descricao, valor: l.valor, data: l.data }))

  const totalDespesasGerais = round2(despesasGerais.reduce((s, d) => s + d.valor, 0))
  const totalOutrasDespesas = round2(outrasDespesas.reduce((s, d) => s + d.valor, 0))
  const totalSaida = round2(totalDespesasGerais + totalOutrasDespesas)

  return {
    de20PctNaoParticipantes,
    deMetadeDespesasNaoParticipantes,
    deDiagrama3PagamentosClinica,
    totalEntrada,
    despesasGerais,
    totalDespesasGerais,
    outrasDespesas,
    totalOutrasDespesas,
    totalSaida,
    saldo: round2(totalEntrada - totalSaida),
  }
}

// ── Orquestrador ──
export type FechamentoMensalResultado =
  | ({ tipo: 'branchA'; dentista: DentistaRow } & ResultadoBranchA)
  | ({ tipo: 'marco'; dentista: DentistaRow } & ResultadoMarco)
  | ({ tipo: 'diagrama2'; dentista: DentistaRow; rateioAgregado: RateioAgregado } & ResultadoDiagrama2)
  | ({ tipo: 'diagrama3'; dentista: DentistaRow; rateioAgregado: RateioAgregado } & ResultadoDiagrama3)

export async function calcularFechamentoMensal(dentistaId: string, mes: number, ano: number): Promise<FechamentoMensalResultado> {
  const { data: dentistasData, error: errDentistas } = await supabase
    .from('dentistas')
    .select('id, nome, ativo, participa_despesas_comuns')
    .eq('ativo', true)
  if (errDentistas) throw new Error(errDentistas.message)
  const dentistas: DentistaRow[] = dentistasData ?? []

  const dentista = dentistas.find(d => d.id === dentistaId)
  if (!dentista) throw new Error('Dentista não encontrado ou inativo')

  // Janela alargada: dataEfetiva() pode empurrar um lançamento de cartão de
  // crédito ~30 dias pra frente, então buscamos por data bruta numa faixa
  // maior e filtramos pela data efetiva em memória.
  const inicioMes   = toISO(ano, mes, 1)
  const fimMes      = toISO(ano, mes, new Date(ano, mes + 1, 0).getDate())
  const inicioBusca = addDias(inicioMes, -35)
  const fimBusca     = addDias(fimMes, 35)

  const { data: lancamentosData, error: errLanc } = await supabase
    .from('lancamentos')
    .select('id, data, tipo, descricao, valor, forma, paciente_id, dentista_id, dentista_responsavel_id')
    .gte('data', inicioBusca)
    .lte('data', fimBusca)
  if (errLanc) throw new Error(errLanc.message)
  const todosLancamentos: LancamentoCalc[] = lancamentosData ?? []

  const lancamentos = todosLancamentos.filter(l => {
    const ef = dataEfetiva(l)
    return ef >= inicioMes && ef <= fimMes
  })

  // Filtramos repasses pela data (via join com lancamentos), não por uma
  // lista de IDs: a janela pode ter centenas de lançamentos, e um `.in()`
  // com todos os IDs produz uma URL longa o suficiente pro Kong rejeitar
  // com "414 URI too long" (vira NetworkError no navegador). Refina-se
  // pelo Set de `ids` (pós-filtro de data efetiva) em memória depois.
  const idsSet = new Set(lancamentos.map(l => l.id))
  let repasses: RepasseCalc[] = []
  if (idsSet.size > 0) {
    const { data: repassesData, error: errRep } = await supabase
      .from('repasses')
      .select('id, lancamento_id, dentista_origem_id, dentista_destino_id, valor, lancamentos!inner(data)')
      .gte('lancamentos.data', inicioBusca)
      .lte('lancamentos.data', fimBusca)
    if (errRep) throw new Error(errRep.message)
    repasses = (repassesData as (RepasseCalc & { lancamentos: unknown })[] ?? [])
      .filter(r => idsSet.has(r.lancamento_id))
      .map(({ id, lancamento_id, dentista_origem_id, dentista_destino_id, valor }) =>
        ({ id, lancamento_id, dentista_origem_id, dentista_destino_id, valor }))
  }

  const marco = resolverMarco(dentistas)
  const joseMoises = resolverJoseMoises(dentistas)
  const raissa = resolverRaissa(dentistas)
  const rateioAgregado = calcularRateioAgregado(dentistas, lancamentos)

  if (!dentista.participa_despesas_comuns) {
    return { tipo: 'branchA', dentista, ...calcularBranchA(dentistaId, lancamentos) }
  }

  if (marco && dentista.id === marco.id) {
    return { tipo: 'marco', dentista, ...calcularMarcoRecebeOsDinheiros(dentistas, lancamentos, repasses) }
  }

  if ((joseMoises && dentista.id === joseMoises.id) || (raissa && dentista.id === raissa.id)) {
    return {
      tipo: 'diagrama2',
      dentista,
      rateioAgregado,
      ...calcularDiagrama2(dentistaId, lancamentos, repasses, rateioAgregado.valorPorParticipante),
    }
  }

  return {
    tipo: 'diagrama3',
    dentista,
    rateioAgregado,
    ...calcularDiagrama3(dentistaId, lancamentos, repasses, rateioAgregado.valorPorParticipante),
  }
}

// ── Persistência do fechamento (trava mensal) ──
// Guarda um snapshot do resultado calculado no momento do fechamento, pra
// que reabrir o mês pra edição não mude o que já foi mostrado ao dentista.
export type FechamentoRegistro = {
  id: string
  dentistaId: string
  ano: number
  mes: number
  status: 'fechado' | 'reaberto'
  resultado: FechamentoMensalResultado
  fechadoEm: string
  fechadoPor: string | null
  reabertoEm: string | null
  reabertoPor: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fechamentos() { return supabase.from('fechamentos_mensais' as any) as any }

export async function buscarFechamento(dentistaId: string, mes: number, ano: number): Promise<FechamentoRegistro | null> {
  const { data, error } = await fechamentos()
    .select('id, dentista_id, ano, mes, status, resultado, fechado_em, fechado_por, reaberto_em, reaberto_por')
    .eq('dentista_id', dentistaId).eq('ano', ano).eq('mes', mes)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    dentistaId: data.dentista_id,
    ano: data.ano,
    mes: data.mes,
    status: data.status,
    resultado: data.resultado,
    fechadoEm: data.fechado_em,
    fechadoPor: data.fechado_por,
    reabertoEm: data.reaberto_em,
    reabertoPor: data.reaberto_por,
  }
}

export async function fecharMes(
  dentistaId: string, mes: number, ano: number,
  resultado: FechamentoMensalResultado, fechadoPor: string,
): Promise<void> {
  const { error } = await fechamentos()
    .upsert({
      dentista_id: dentistaId, ano, mes,
      status: 'fechado', resultado,
      fechado_em: new Date().toISOString(), fechado_por: fechadoPor,
      reaberto_em: null, reaberto_por: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dentista_id,ano,mes' })
  if (error) throw new Error(error.message)
}

export async function reabrirMes(id: string, reabertoPor: string): Promise<void> {
  const { error } = await fechamentos()
    .update({
      status: 'reaberto',
      reaberto_em: new Date().toISOString(), reaberto_por: reabertoPor,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
