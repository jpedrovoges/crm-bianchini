import { supabase } from '@/lib/supabase'

export type FechamentoMensal = {
  id: string
  dentista_id: string
  ano: number
  mes: number // 0-11
  status: 'fechado' | 'reaberto'
  comissao_pagar: number
  rateio_despesas_gerais: number
  despesas_atribuidas: number
  comissao_a_receber: number
  participacao_cirurgia: number
  total_a_pagar_clinica: number
  valor_pf: number
  valor_pj: number
  fechado_em: string
  fechado_por: string | null
  reaberto_em: string | null
  reaberto_por: string | null
}

export function mesEstaFechado(f: FechamentoMensal | null | undefined) {
  return f?.status === 'fechado'
}

// Extrai {ano, mes} (mes 0-11) de uma data 'YYYY-MM-DD'
export function mesDaData(dataISO: string) {
  const [ano, mes] = dataISO.split('-').map(Number)
  return { ano, mes: mes - 1 }
}

export async function buscarFechamento(dentistaId: string, ano: number, mes: number) {
  const { data } = await supabase
    .from('fechamentos_mensais')
    .select('*')
    .eq('dentista_id', dentistaId)
    .eq('ano', ano)
    .eq('mes', mes)
    .maybeSingle()
  return (data as FechamentoMensal | null) ?? null
}

// Busca o fechamento de vários dentistas no mesmo mês/ano de uma vez.
export async function buscarFechamentosMap(dentistaIds: string[], ano: number, mes: number) {
  const ids = Array.from(new Set(dentistaIds)).filter(Boolean)
  if (ids.length === 0) return {} as Record<string, FechamentoMensal>
  const { data } = await supabase
    .from('fechamentos_mensais')
    .select('*')
    .in('dentista_id', ids)
    .eq('ano', ano)
    .eq('mes', mes)
  const map: Record<string, FechamentoMensal> = {}
  ;(data as FechamentoMensal[] | null)?.forEach(f => { map[f.dentista_id] = f })
  return map
}

// Checagem pontual usada nos pontos de escrita fora da tela de fechamento:
// retorna true se o mês do dentista está fechado E o usuário não é admin.
export async function bloqueadoPorMesFechado(dentistaId: string | null | undefined, dataISO: string, role: string | undefined) {
  if (!dentistaId || role === 'admin') return false
  const { ano, mes } = mesDaData(dataISO)
  const f = await buscarFechamento(dentistaId, ano, mes)
  return mesEstaFechado(f)
}

export const MES_FECHADO_MSG = 'Este mês está fechado para este dentista. Peça para um admin reabrir antes de editar.'
