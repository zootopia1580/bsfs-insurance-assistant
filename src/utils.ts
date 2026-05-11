/** 한국 성명에서 성(첫 글자)을 뺀 이름 반환 */
export function firstName(fullName: string): string {
  return fullName.trim().slice(1)
}
