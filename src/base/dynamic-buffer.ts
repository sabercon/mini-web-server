export default class DynamicBuffer {
  constructor(
    private buffer: Buffer = Buffer.alloc(16),
    private start = 0,
    private end = 0,
  ) {}

  push(data: Buffer) {
    this.ensureCap(data.length)
    data.copy(this.buffer, this.end)
    this.end += data.length
  }

  pushString(data: string) {
    this.push(Buffer.from(data))
  }

  pop(size: number): Buffer {
    if (size > this.size()) {
      throw new Error(`${size} is greater than buffer size ${this.size()}`)
    }
    const data = Buffer.from(this.data().subarray(0, size))
    this.start += size
    this.compactCap()
    return data
  }

  popString(size: number): string {
    return this.pop(size).toString()
  }

  data(): Buffer {
    return this.buffer.subarray(this.start, this.end)
  }

  size(): number {
    return this.end - this.start
  }

  indexOf(value: string, byteOffset?: number): number {
    return this.data().indexOf(value, byteOffset)
  }

  private ensureCap(sizeToAdd: number) {
    if (this.end + sizeToAdd <= this.buffer.length) return

    const cap = this.buffer.length
    const newCap = this.calcCap(cap, this.size() + sizeToAdd)
    const targetBuffer = newCap > cap ? Buffer.alloc(newCap) : this.buffer

    this.buffer.copy(targetBuffer, 0, this.start, this.end)
    this.buffer = targetBuffer
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
    } else if (this.start > this.buffer.length / 2) {
      this.buffer.copyWithin(0, this.start, this.end)
      this.end -= this.start
      this.start = 0
    }
  }
}
