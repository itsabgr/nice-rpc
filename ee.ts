const isFalse = (val: unknown): boolean => {
  return typeof val === 'boolean' && val === false
}

export interface Callback<Args extends unknown[], Return = false | void> {
  (...args: Args): Return | Promise<Return>
}

export class EE<Args extends unknown[] = []> {
  #list = new Set<Callback<Args>>()

  constructor() {
  }
  public wait(timeout?: number): Promise<Args> {
    return new Promise<Args>((resolve, reject) => {
      let timer: unknown;
      if (timeout) {
        timer = setTimeout(() => {
          reject(new Error('wait: timeout'))
        }, timeout)
      }
      this.#list.add((...args: Args) => {
        if (timeout) {
          //@ts-ignore
          clearTimeout(timer)
        }
        resolve(args)
        return false
      })
    })
  }

  public do(callback: Callback<Args>) {
    if (typeof callback !== 'function') {
      throw new TypeError(`${callback} is not a function`)
    }
    this.#list.add(callback)
    return callback
  }

  public delete(callback: Callback<Args>) {
    return this.#list.delete(callback)
  }

  public emit(...args: Args): void | Promise<void> {
    const callbacks = Array.from(this.#list.values())
    for (let i = 0; i < callbacks.length; i++) {
      const callback = callbacks[i] as Callback<Args>
      let result = callback(...args) as any
      if (result instanceof Promise) {
        return new Promise<void>(async resolve => {
          result = await result
          for (; i < callbacks.length; i++) {
            const callback = callbacks[i] as Callback<Args>
            let result = callback(...args) as any
            if (result instanceof Promise) {
              result = await result
            }
            if (isFalse(result)) {
              this.#list.delete(callback)
            }
          }
          resolve()
        })
      }
      if (isFalse(result)) {
        this.#list.delete(callback)
      }
    }
  }
}

export default EE