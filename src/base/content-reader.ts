import fs from "fs/promises"
import zlib from "node:zlib"
import stream from "stream"
import { pipeline } from "stream/promises"

export default class ContentReader {
  constructor(
    public readonly size: number | null,
    public readonly read: () => Promise<Buffer | "EOF">,
    public readonly close?: () => Promise<void>,
  ) {}

  toStream(): stream.Readable {
    const self = new stream.Readable({
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      read: async () => {
        try {
          const data = await this.read()
          self.push(data == "EOF" ? null : data)
        } catch (error) {
          self.destroy(error as Error)
        }
      },
    })
    return self
  }

  withGzip(): ContentReader {
    const gzip = zlib.createGzip()
    pipeline(this.toStream(), gzip).catch((e: Error) => gzip.destroy(e)) // no await

    const iter = gzip.iterator()
    return new ContentReader(
      null,
      async () => {
        const result = await iter.next()
        return result.done ? "EOF" : (result.value as Buffer)
      },
      this.close,
    )
  }

  static empty(): ContentReader {
    return new ContentReader(0, () => Promise.resolve("EOF"))
  }

  static fromBuffer(data: Buffer): ContentReader {
    let done = false
    return new ContentReader(data.length, () => {
      if (done) return Promise.resolve("EOF")

      done = true
      return Promise.resolve(data)
    })
  }

  static fromGenerator(gen: BufferGenerator): ContentReader {
    return new ContentReader(
      null,
      async () => {
        const result = await gen.next()
        return result.done ? "EOF" : result.value
      },
      async () => {
        await gen.return()
      },
    )
  }

  static fromFile(fp: fs.FileHandle, size: number): ContentReader {
    let read = 0
    return new ContentReader(
      size,
      async () => {
        const result = await fp.read()
        if (result.bytesRead == 0) {
          if (read == size) return "EOF"
          throw new Error(`File Size Changed. Expected: ${size}`)
        }

        read += result.bytesRead
        if (read > size) {
          // cannot continue since we have sent the `Content-Length`.
          throw new Error(`File Size Changed. Expected: ${size}`)
        }
        return result.buffer.subarray(0, result.bytesRead)
      },
      async () => await fp.close(),
    )
  }
}

type BufferGenerator = AsyncGenerator<Buffer, void, void>
