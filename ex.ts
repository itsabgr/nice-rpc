export function Exception(message: string, extra?: object): Error & { [key in keyof typeof extra]: typeof extra[key] } {
  const e = new Error(message)
  return Object.assign(e, extra)
}
export default Exception