export default class AttestationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AttestationError'
  }
}