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
  data_efetiva: string | null
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

// Base líquida do fechamento: Total − imposto (11,33%) − laboratório. É sobre
// ela que se aplicam a comissão de 13% e o split 50/20/30.
function baseLiquida(total: number, laboratorio: number) {
  const imposto = round2(total * IMPOSTO_NF_PCT / 100)
  return { imposto, base: round2(Math.max(0, total - imposto - laboratorio)) }
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

export function dataEfetiva(l: { data: string; forma: string; data_efetiva?: string | null }): string {
  // Sobrescrita manual (admin/gestor) tem prioridade sobre a regra automática
  // — usada quando um dentista específico recebe fora do padrão do cartão.
  if (l.data_efetiva) return l.data_efetiva
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
  // Imposto (11,33%) e laboratório do mês (informado na hora de fechar,
  // pago direto pelo dentista) saem do total antes do 50/20/30.
  impostoNF: number
  totalLaboratorio: number
  baseRateio: number
  valorDentista: number
  valorMarco20pct: number
  poolParticipantes30pct: number
  despesas: LancamentoCalc[]
  totalDespesas: number
  teveDespesa: boolean
  metadeDespesaMarco: number
  totalAAcertar: number
}

export function calcularBranchA(dentistaId: string, lancamentos: LancamentoCalc[], laboratorio = 0): ResultadoBranchA {
  const totalReceitas = round2(
    lancamentos.filter(l => l.tipo === 'receita' && l.dentista_id === dentistaId).reduce((s, l) => s + l.valor, 0)
  )
  const totalLaboratorio = round2(laboratorio)
  const { imposto: impostoNF, base: baseRateio } = baseLiquida(totalReceitas, totalLaboratorio)
  const valorDentista = round2(baseRateio * RATEIO_DENTISTA_PCT / 100)
  const valorMarco20pct = round2(baseRateio * RATEIO_MARCO_PCT / 100)
  const poolParticipantes30pct = round2(baseRateio * RATEIO_PARTICIPANTES_PCT / 100)

  const despesas = despesasDoDentista(lancamentos, dentistaId)
  const totalDespesas = round2(despesas.reduce((s, l) => s + l.valor, 0))
  const teveDespesa = totalDespesas > 0
  const metadeDespesaMarco = teveDespesa ? round2(totalDespesas / 2) : 0
  const totalAAcertar = round2(valorDentista - metadeDespesaMarco)

  return { totalReceitas, impostoNF, totalLaboratorio, baseRateio, valorDentista, valorMarco20pct, poolParticipantes30pct, despesas, totalDespesas, teveDespesa, metadeDespesaMarco, totalAAcertar }
}

// Laboratório informado por dentista no fechamento do mês (dentistaId → R$).
// O fechamento de um dentista depende do laboratório de outros (pool do
// rateio, 20% e 13% do Marco), então o mapa vem dos fechamentos já gravados.
export type LaboratorioPorDentista = Map<string, number>

// ── Pool de rateio agregado (todos os não-participantes → todos os participantes) ──
export type RateioAgregado = { poolTotal: number; nParticipantes: number; valorPorParticipante: number }

export function calcularRateioAgregado(dentistas: DentistaRow[], lancamentos: LancamentoCalc[], labs: LaboratorioPorDentista = new Map()): RateioAgregado {
  const naoParticipantes = dentistas.filter(d => d.ativo && !d.participa_despesas_comuns)
  const poolTotal = round2(
    naoParticipantes.reduce((s, d) => s + calcularBranchA(d.id, lancamentos, labs.get(d.id)).poolParticipantes30pct, 0)
  )
  const nParticipantes = participantesRateio(dentistas).length
  const valorPorParticipante = nParticipantes > 0 ? round2(poolTotal / nParticipantes) : 0
  return { poolTotal, nParticipantes, valorPorParticipante }
}

// O valor da venda (particular ou Celos) cai direto na conta do dentista,
// nunca passa pela clínica. A comissão do Marco vem de duas fontes:
//  - Celos: já enviada na importação da planilha (ImportarCelos grava um
//    lançamento "Comissão Celos - <primeiro nome>" em nome do Marco) — aqui
//    só é mostrada, não entra de novo no total;
//  - demais entradas (dinheiro, pix, cartão, boleto): 13% calculados no
//    fechamento, a enviar pro Marco.
export function descricaoComissaoCelos(nomeDentista: string) {
  return `Comissão Celos - ${nomeDentista.trim().split(' ')[0]}`
}

export function calcularComissaoCelosEnviada(lancamentos: LancamentoCalc[], dentistaNome: string, marcoId: string | undefined): number {
  if (!marcoId) return 0
  const alvo = normalize(descricaoComissaoCelos(dentistaNome))
  return round2(
    lancamentos
      .filter(l => l.tipo === 'receita' && l.dentista_id === marcoId && normalize(l.descricao) === alvo)
      .reduce((s, l) => s + l.valor, 0)
  )
}

// Receitas do dentista que não são convênio (Celos já tem comissão própria)
// nem movimentação interna — base dos 13% de comissão do Marco.
function receitasBaseComissao(lancamentos: LancamentoCalc[], dentistaId: string) {
  return lancamentos.filter(l =>
    l.tipo === 'receita' && l.dentista_id === dentistaId && l.forma !== 'Convênio' && l.forma !== 'Interno'
  )
}

// 13% sobre (Total − imposto 11,33% − laboratório).
export function calcularComissao13(lancamentos: LancamentoCalc[], dentistaId: string, laboratorio = 0): number {
  const bruto = receitasBaseComissao(lancamentos, dentistaId).reduce((s, l) => s + l.valor, 0)
  return round2(baseLiquida(bruto, laboratorio).base * COMISSAO_MARCO_PCT / 100)
}

export type ReceitaPorForma = { forma: string; total: number }

export type ResultadoDiagrama2 = {
  rateioTotal: number
  rateio: number
  comissaoCelosEnviada: number
  receitasPorForma: ReceitaPorForma[]
  baseComissao: number
  impostoNF: number
  totalLaboratorio: number
  baseComissaoLiquida: number
  comissao13: number
  // Despesas do mês atribuídas a ele, incluindo a fatia do rateio das
  // despesas comuns (forma 'Interno', gerada pelo "Fechar Mês" da aba
  // Despesas Comuns) — mesmo split usado no diagrama do Marco.
  despesasGerais: DespesaMarco[]
  totalDespesasGerais: number
  outrasDespesas: DespesaMarco[]
  totalOutrasDespesas: number
  totalDespesas: number
  total: number
}

export function calcularDiagrama2(
  dentista: DentistaRow,
  marcoId: string | undefined,
  lancamentos: LancamentoCalc[],
  rateioAgregado: RateioAgregado,
  laboratorio = 0,
): ResultadoDiagrama2 {
  const comissaoCelosEnviada = calcularComissaoCelosEnviada(lancamentos, dentista.nome, marcoId)

  const porForma = new Map<string, number>()
  for (const l of receitasBaseComissao(lancamentos, dentista.id)) {
    porForma.set(l.forma, (porForma.get(l.forma) ?? 0) + l.valor)
  }
  const receitasPorForma = [...porForma]
    .map(([forma, total]) => ({ forma, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
  const baseComissao = round2(receitasPorForma.reduce((s, f) => s + f.total, 0))
  const totalLaboratorio = round2(laboratorio)
  const { imposto: impostoNF, base: baseComissaoLiquida } = baseLiquida(baseComissao, totalLaboratorio)
  const comissao13 = calcularComissao13(lancamentos, dentista.id, totalLaboratorio)

  const despesasDeste = despesasDoDentista(lancamentos, dentista.id)
  const despesasGerais = despesasDeste
    .filter(l => l.forma === 'Interno')
    .map(l => ({ id: l.id, descricao: l.descricao, valor: l.valor, data: l.data }))
  const outrasDespesas = despesasDeste
    .filter(l => l.forma !== 'Interno')
    .map(l => ({ id: l.id, descricao: l.descricao, valor: l.valor, data: l.data }))
  const totalDespesasGerais = round2(despesasGerais.reduce((s, d) => s + d.valor, 0))
  const totalOutrasDespesas = round2(outrasDespesas.reduce((s, d) => s + d.valor, 0))
  const totalDespesas = round2(totalDespesasGerais + totalOutrasDespesas)

  return {
    rateioTotal: rateioAgregado.poolTotal,
    rateio: rateioAgregado.valorPorParticipante,
    comissaoCelosEnviada,
    receitasPorForma,
    baseComissao,
    impostoNF,
    totalLaboratorio,
    baseComissaoLiquida,
    comissao13,
    despesasGerais,
    totalDespesasGerais,
    outrasDespesas,
    totalOutrasDespesas,
    totalDespesas,
    total: round2(rateioAgregado.valorPorParticipante - comissao13 - totalDespesas),
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
  somaB_laboratorio: number
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
  laboratorio = 0,
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
  // (mesmo padrão de calcLiquido() em ImportarCelos.tsx), não somados. O
  // laboratório (pago direto pelo dentista) sai depois do imposto e antes
  // da comissão — mesma ordem do fechamento antigo.
  const somaB_laboratorio = round2(laboratorio)
  const somaB_faturamentoParticularLiquido = round2(
    Math.max(0, somaB_faturamentoParticularBruto * (1 - IMPOSTO_NF_PCT / 100) - somaB_laboratorio) * (1 - COMISSAO_MARCO_PCT / 100)
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
    somaB_laboratorio,
    somaB_faturamentoParticularLiquido,
    somaB,
    quemPaga,
    valor,
  }
}

// ── Marco Bianchini: "só recebe os dinheiros" ──
// Total entrada = tudo que entra pra ele no mês: receitas lançadas em nome
// dele (inclui as "Comissão Celos - X" gravadas na importação), 20% + metade
// das despesas dos não-participantes, os 13% de comissão de José Moisés /
// Raissa e o que os demais participantes (Diagrama 3) pagam à clínica.
export type ContribuicaoMarco = { dentistaId: string; nome: string; valor: number }
export type DespesaMarco = { id: string; descricao: string; valor: number; data: string }

export type ResultadoMarco = {
  receitasProprias: DespesaMarco[]
  totalReceitasProprias: number
  deComissao13Diagrama2: ContribuicaoMarco[]
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
  labs: LaboratorioPorDentista = new Map(),
): ResultadoMarco {
  const marco = resolverMarco(dentistas)
  const joseMoises = resolverJoseMoises(dentistas)
  const raissa = resolverRaissa(dentistas)

  const naoParticipantes = dentistas.filter(d => d.ativo && !d.participa_despesas_comuns)

  const receitasProprias = marco
    ? lancamentos
        .filter(l => l.tipo === 'receita' && l.dentista_id === marco.id)
        .map(l => ({ id: l.id, descricao: l.descricao, valor: l.valor, data: l.data }))
    : []
  const totalReceitasProprias = round2(receitasProprias.reduce((s, r) => s + r.valor, 0))

  const deComissao13Diagrama2 = [joseMoises, raissa]
    .filter((d): d is DentistaRow => !!d && d.participa_despesas_comuns)
    .map(d => ({ dentistaId: d.id, nome: d.nome, valor: calcularComissao13(lancamentos, d.id, labs.get(d.id)) }))
    .filter(c => c.valor > 0)

  const de20PctNaoParticipantes = naoParticipantes
    .map(d => ({ dentistaId: d.id, nome: d.nome, valor: calcularBranchA(d.id, lancamentos, labs.get(d.id)).valorMarco20pct }))
    .filter(c => c.valor > 0)

  const deMetadeDespesasNaoParticipantes = naoParticipantes
    .map(d => ({ dentistaId: d.id, nome: d.nome, valor: calcularBranchA(d.id, lancamentos, labs.get(d.id)).metadeDespesaMarco }))
    .filter(c => c.valor > 0)

  const rateioAgregado = calcularRateioAgregado(dentistas, lancamentos, labs)
  const outrosParticipantes = participantesRateio(dentistas).filter(d =>
    d.id !== marco?.id && d.id !== joseMoises?.id && d.id !== raissa?.id
  )
  const deDiagrama3PagamentosClinica = outrosParticipantes
    .map(d => {
      const r = calcularDiagrama3(d.id, lancamentos, repasses, rateioAgregado.valorPorParticipante, labs.get(d.id))
      return { dentistaId: d.id, nome: d.nome, valor: r.quemPaga === 'dentista' ? r.valor : 0 }
    })
    .filter(c => c.valor > 0)

  const totalEntrada = round2(
    totalReceitasProprias +
    deComissao13Diagrama2.reduce((s, c) => s + c.valor, 0) +
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
    receitasProprias,
    totalReceitasProprias,
    deComissao13Diagrama2,
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

// Valor final assinado do fechamento, qualquer que seja o tipo do dentista:
// positivo = clínica deve/paga pro dentista, negativo = dentista deve pra
// clínica. Usado pra mostrar um resumo único (ex. "valor a pagar este mês")
// sem precisar checar o tipo em cada tela.
// Laboratório gravado num resultado (snapshot de fechamento). Snapshots de
// antes dessa regra não têm o campo — conta como 0.
export function laboratorioDoResultado(r: FechamentoMensalResultado): number {
  if (r.tipo === 'branchA' || r.tipo === 'diagrama2') return r.totalLaboratorio ?? 0
  if (r.tipo === 'diagrama3') return r.somaB_laboratorio ?? 0
  return 0
}

export function valorFinalFechamento(r: FechamentoMensalResultado): number {
  if (r.tipo === 'branchA') return r.totalAAcertar
  if (r.tipo === 'marco') return r.saldo
  if (r.tipo === 'diagrama2') return r.total
  return r.quemPaga === 'dentista' ? -r.valor : r.valor
}

// `laboratorio`: valor digitado na tela de fechamento pra este dentista. Se
// omitido, usa o que estiver gravado no fechamento dele (ou 0).
export async function calcularFechamentoMensal(dentistaId: string, mes: number, ano: number, laboratorio?: number): Promise<FechamentoMensalResultado> {
  const { data: dentistasData, error: errDentistas } = await supabase
    .from('dentistas')
    .select('id, nome, ativo, participa_despesas_comuns')
    .eq('ativo', true)
  if (errDentistas) throw new Error(errDentistas.message)
  const dentistas: DentistaRow[] = dentistasData ?? []

  const dentista = dentistas.find(d => d.id === dentistaId)
  if (!dentista) throw new Error('Dentista não encontrado ou inativo')

  // Janela alargada: dataEfetiva() pode empurrar um lançamento de cartão de
  // crédito ~30 dias pra frente (ou mais, se houver sobrescrita manual de
  // data_efetiva), então buscamos por data bruta numa faixa maior e
  // filtramos pela data efetiva em memória.
  const inicioMes   = toISO(ano, mes, 1)
  const fimMes      = toISO(ano, mes, new Date(ano, mes + 1, 0).getDate())
  const inicioBusca = addDias(inicioMes, -62)
  const fimBusca     = addDias(fimMes, 62)

  const { data: lancamentosData, error: errLanc } = await supabase
    .from('lancamentos')
    .select('id, data, tipo, descricao, valor, forma, paciente_id, dentista_id, dentista_responsavel_id, data_efetiva')
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

  const { data: fechamentosData, error: errFech } = await fechamentos()
    .select('dentista_id, resultado')
    .eq('ano', ano).eq('mes', mes)
  if (errFech) throw new Error(errFech.message)
  const labs: LaboratorioPorDentista = new Map(
    ((fechamentosData ?? []) as { dentista_id: string; resultado: FechamentoMensalResultado }[])
      .map(f => [f.dentista_id, laboratorioDoResultado(f.resultado)])
  )
  if (laboratorio !== undefined) labs.set(dentistaId, laboratorio)
  const labDentista = labs.get(dentistaId) ?? 0

  const marco = resolverMarco(dentistas)
  const joseMoises = resolverJoseMoises(dentistas)
  const raissa = resolverRaissa(dentistas)
  const rateioAgregado = calcularRateioAgregado(dentistas, lancamentos, labs)

  if (!dentista.participa_despesas_comuns) {
    return { tipo: 'branchA', dentista, ...calcularBranchA(dentistaId, lancamentos, labDentista) }
  }

  if (marco && dentista.id === marco.id) {
    return { tipo: 'marco', dentista, ...calcularMarcoRecebeOsDinheiros(dentistas, lancamentos, repasses, labs) }
  }

  if ((joseMoises && dentista.id === joseMoises.id) || (raissa && dentista.id === raissa.id)) {
    return {
      tipo: 'diagrama2',
      dentista,
      rateioAgregado,
      ...calcularDiagrama2(dentista, marco?.id, lancamentos, rateioAgregado, labDentista),
    }
  }

  return {
    tipo: 'diagrama3',
    dentista,
    rateioAgregado,
    ...calcularDiagrama3(dentistaId, lancamentos, repasses, rateioAgregado.valorPorParticipante, labDentista),
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
