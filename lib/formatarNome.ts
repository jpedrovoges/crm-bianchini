export function formatarCpf(valor: string): string {
  const digits = valor.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

const CONECTIVOS = new Set([
  'da', 'de', 'do', 'das', 'dos', 'di', 'du',
  'e', 'von', 'van', 'der', 'del', 'el', 'y',
])

export function formatarNome(valor: string): string {
  return valor
    .toLowerCase()
    .split(' ')
    .map((palavra, i) => {
      if (!palavra) return palavra
      if (i > 0 && CONECTIVOS.has(palavra)) return palavra
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(' ')
}
