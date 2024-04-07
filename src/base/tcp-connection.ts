import * as net from "net"

export default class TCPConnection {
  static readonly EOF = Buffer.from("")

  readonly #socket: net.Socket
  // from the 'error' event
  #err?: Error
  // EOF, from the 'end' event
  #ended: boolean
  // the callbacks of the promise of the current read
  #reader: null | {
    resolve: (value: Buffer) => void
    reject: (error: Error) => void
  }

  constructor(socket: net.Socket) {
    this.#socket = socket
    this.#ended = false
    this.#reader = null
    socket.on("data", this.#onData.bind(this))
    socket.on("end", this.#onEnd.bind(this))
    socket.on("error", this.#onError.bind(this))
  }

  async read(): Promise<Buffer> {
    console.assert(!this.#reader) // no concurrent calls
    return new Promise((resolve, reject) => {
      // if the connection is not readable, completes the promise
      if (this.#err) {
        reject(this.#err)
        return
      }
      if (this.#ended) {
        resolve(TCPConnection.EOF)
        return
      }

      // saves the promise callbacks
      this.#reader = { resolve: resolve, reject: reject }
      // and resumes the 'data' event to fulfill the promise later
      this.#socket.resume()
    })
  }

  async write(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.write(data, (err) => {
        err ? reject(err) : resolve()
      })
    })
  }

  #onData(data: Buffer) {
    console.assert(this.#reader)
    // pauses the 'data' event until the next read
    this.#socket.pause()
    // fulfills the promise of the current read
    this.#reader!.resolve(data)
    this.#reader = null
  }

  #onEnd() {
    this.#ended = true
    if (this.#reader) {
      this.#reader.resolve(TCPConnection.EOF)
      this.#reader = null
    }
  }

  #onError(err: Error) {
    this.#err = err
    if (this.#reader) {
      this.#reader.reject(err)
      this.#reader = null
    }
  }
}
