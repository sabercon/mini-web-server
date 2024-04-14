import * as net from "net"

export default class TCPConnection {
  // from the 'error' event
  private err?: Error
  // from the 'end' event
  private ended: boolean
  // the callbacks of the promise of the current read
  private reader: null | {
    resolve: (value: Buffer | "END") => void
    reject: (error: Error) => void
  }

  constructor(private readonly socket: net.Socket) {
    this.ended = false
    this.reader = null
    socket.on("data", this.onData.bind(this))
    socket.on("end", this.onEnd.bind(this))
    socket.on("error", this.onError.bind(this))
  }

  async read(): Promise<Buffer | "END"> {
    // there should be no concurrent calls
    console.assert(!this.reader)
    return new Promise((resolve, reject) => {
      // if the connection is not readable, completes the promise
      if (this.err) {
        reject(this.err)
        return
      }
      if (this.ended) {
        console.log("END")
        resolve("END")
        return
      }

      // saves the promise callbacks
      this.reader = { resolve: resolve, reject: reject }
      // resumes the 'data' event to fulfill the promise later
      this.socket.resume()
    })
  }

  async write(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err) => {
        err ? reject(err) : resolve()
      })
    })
  }

  private onData(data: Buffer) {
    console.assert(this.reader)
    // pauses the 'data' event until the next read
    this.socket.pause()
    // fulfills the promise of the current read
    this.reader!.resolve(data)
    this.reader = null
  }

  private onEnd() {
    this.ended = true
    if (this.reader) {
      console.log("END")
      this.reader.resolve("END")
      this.reader = null
    }
  }

  private onError(err: Error) {
    this.err = err
    if (this.reader) {
      this.reader.reject(err)
      this.reader = null
    }
  }
}
