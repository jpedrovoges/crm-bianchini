// Imposto da nota fiscal descontado de guias de convênio (Celos, Elo Saúde),
// igual para qualquer beneficiário — não é um percentual que varia por
// lançamento ou por dentista.
export const IMPOSTO_NF_PCT = 11.33

// Split fixo do fechamento de mês para dentista que NÃO participa do rateio:
// do total de receitas do dentista no mês, 50% fica com ele, 20 p.p. vão
// para Marco Bianchini, e os 30 p.p. restantes formam um pool dividido
// igualmente entre os dentistas participantes do rateio ativos.
export const RATEIO_DENTISTA_PCT = 50
export const RATEIO_MARCO_PCT = 20
export const RATEIO_PARTICIPANTES_PCT = 30

// Comissão da clínica sobre o faturamento particular líquido de um dentista
// participante do rateio (fechamento de mês, Diagrama 3) — aplicada depois
// do IMPOSTO_NF_PCT, é um percentual distinto, não confundir com ele.
export const COMISSAO_MARCO_PCT = 13
