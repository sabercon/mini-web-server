export default class DynamicBuffer {
  #buffer: Buffer
  #start: number
  #end: number

  constructor() {
    this.#buffer = Buffer.alloc(1024)
    this.#start = 0
    this.#end = 0
  }

  push(data: Buffer) {
    this.#ensureCapacity(data.length)
    data.copy(this.#buffer, this.#end)
    this.#end += data.length
  }

  pop(size: number): Buffer {
    console.assert(size <= this.#end - this.#start)
    const data = this.#buffer.subarray(this.#start, this.#start + size)
    this.#start += size

    if (this.#start == this.#end) {
      this.#start = 0
      this.#end = 0
    } else if (this.#start > this.#buffer.length / 2) {
      this.#buffer.copy(this.#buffer, 0, this.#start, this.#end)
      this.#end -= this.#start
      this.#start = 0
    }

    return data
  }

  data(): Buffer {
    return this.#buffer.subarray(this.#start, this.#end)
  }

  #ensureCapacity(sizeToAdd: number) {
    if (this.#end + sizeToAdd <= this.#buffer.length) return

    const size = this.#end - this.#start
    const cap = this.#buffer.length
    const newSize = size + sizeToAdd
    const newCap = this.#calculateCapacity(cap, newSize)
    const newBuffer = newCap > cap ? Buffer.alloc(newCap) : this.#buffer

    this.#buffer.copy(newBuffer, 0, this.#start, this.#end)
    this.#buffer = newBuffer
    this.#start = 0
    this.#end = size
  }

  #calculateCapacity(current: number, target: number): number {
    return current >= target
      ? current
      : this.#calculateCapacity(current * 2, target)
  }
}
