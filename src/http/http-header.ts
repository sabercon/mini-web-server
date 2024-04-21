const CONTENT_LENGTH = "Content-Length"
const TRANSFER_ENCODING = "Transfer-Encoding"
const ACCEPT_ENCODING = "Accept-Encoding"
const CONTENT_ENCODING = "Content-Encoding"

export default class HTTPHeader {
  constructor(
    public readonly name: string,
    public readonly value: string,
  ) {}

  toString(): string {
    return `${this.name}: ${this.value}`
  }

  static from(line: string): HTTPHeader {
    const [name, value] = line.split(":")
    return new HTTPHeader(name.trim(), value.trim())
  }

  static contentLength(length: number): HTTPHeader {
    return new HTTPHeader(CONTENT_LENGTH, length.toString())
  }

  static transferEncoding(encoding: string): HTTPHeader {
    return new HTTPHeader(TRANSFER_ENCODING, encoding)
  }

  static contentEncoding(encoding: string): HTTPHeader {
    return new HTTPHeader(CONTENT_ENCODING, encoding)
  }

  static findContentLength(headers: HTTPHeader[]): number {
    const length = HTTPHeader.find(headers, CONTENT_LENGTH)
    return length ? parseInt(length) : -1
  }

  static findTransferEncoding(headers: HTTPHeader[]): string[] {
    const encodings = HTTPHeader.findList(headers, TRANSFER_ENCODING)
    return encodings.map((v) => v.toLowerCase())
  }

  static findAcceptEncoding(headers: HTTPHeader[]): string[] {
    const encodings = HTTPHeader.findList(headers, ACCEPT_ENCODING)
    return encodings.map((v) => v.toLowerCase())
  }

  static findList(headers: HTTPHeader[], name: string): string[] {
    const value = HTTPHeader.find(headers, name)
    return value?.split(",").map((v) => v.trim()) ?? []
  }

  static find(headers: HTTPHeader[], name: string): string | undefined {
    return headers.find((h) => equalsIgnoreCase(h.name, name))?.value
  }
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) == 0
}
