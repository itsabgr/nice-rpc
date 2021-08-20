import EE from './ee'

const noError = Symbol()

export class Ctx {
  #error?: Error | symbol = noError
  #timer?: unknown
  onClose = new EE<[Error | undefined]>()

  constructor(onClose?: (error?: Error) => void) {
    onClose&&this.onClose.do(onClose)
  }

  get error() {
    if (!this.closed as string) {
      return undefined
    }
    return this.#error
  }

  get closed() {
    if (this.#error === noError) {
      return false
    }
    return true
  }

  close(error?: Error): void | Promise<void> {
    if (this.closed) {
      return undefined
    }
    this.#error = error
    return this.onClose.emit(error)
  }

  timeout(duration: number) {
    if (this.#timer) {
      //@ts-ignore
      clearTimeout(this.#timer)
    }
    this.#timer = setTimeout(() => {
      this.close(new Error('context: timeout'))
    }, duration)
  }
}

export default Ctx