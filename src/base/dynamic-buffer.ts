export default class DynamicBuffer {
  constructor(
    private buf: Buffer = Buffer.alloc(16),
    private start = 0,
    private end = 0,
  ) {}

  push(data: Buffer) {
    this.ensureCap(data.length)
    data.copy(this.buf, this.end)
    this.end += data.length
  }

  pop(size: number): Buffer {
    if (size > this.size()) {
      throw new Error(`${size} is greater than buffer size ${this.size()}`)
    }
    const data = Buffer.from(this.buf.subarray(this.start, this.start + size))
    this.start += size
    this.compactCap()
    return data
  }

  data(): Buffer {
    return this.buf.subarray(this.start, this.end)
  }

  size(): number {
    return this.end - this.start
  }

  indexOf(value: string, byteOffset?: number): number {
    return this.data().indexOf(value, byteOffset)
  }

  private ensureCap(sizeToAdd: number) {
    if (this.end + sizeToAdd <= this.buf.length) return

    const cap = this.buf.length
    const newCap = this.calcCap(cap, this.size() + sizeToAdd)
    const targetBuf = newCap > cap ? Buffer.alloc(newCap) : this.buf

    this.buf.copy(targetBuf, 0, this.start, this.end)
    this.buf = targetBuf
    this.end -= this.start
    this.start = 0
  }

  private calcCap(current: number, target: number): number {
    return current >= target ? current : this.calcCap(current * 2, target)
  }

  private compactCap() {
    if (this.start == this.end) {
      this.start = 0
      this.end = 0
    } else if (this.start > this.buf.length / 2) {
      this.buf.copyWithin(0, this.start, this.end)
      this.end -= this.start
      this.start = 0
    }
  }
}
