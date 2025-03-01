const chai = require('chai')
const expect = chai.expect
const request = require('supertest')
const sinon = require('sinon')
const sendgridMail = require('@sendgrid/mail')
const redis = require('redis')

const Attestation = require('../src/models/index').Attestation
const AttestationTypes = Attestation.AttestationTypes
const app = require('../src/app')

const ethAddress = '0x112234455c3a32fd11230c42e7bccd4a84e02010'
const client = redis.createClient()

describe('email attestations', () => {
  beforeEach(() => {
    // Configure environment variables required for tests
    process.env.ATTESTATION_SIGNING_KEY = '0xc1912'

    // Clear out redis-mock
    client.del('*')

    Attestation.destroy({
      where: {},
      truncate: true
    })
  })

  it('should generate a verification code', async () => {
    const sendStub = sinon.stub(sendgridMail, 'send')

    await request(app)
      .post('/api/attestations/email/generate-code')
      .send({ email: 'origin@protocol.foo' })
      .expect(200)

    expect(sendStub.called).to.be.true

    sendStub.restore()
  })

  it('should return a message on sendgrid error', async () => {
    const sendStub = sinon.stub(sendgridMail, 'send').throws()

    const response = await request(app)
      .post('/api/attestations/email/generate-code')
      .send({ email: 'origin@protocol.foo' })
      .expect(500)

    expect(response.body.errors[0]).to.equal(
      'Could not send email verification code, please try again shortly.'
    )

    sendStub.restore()
  })

  it('should generate attestation on valid verification code', async () => {
    await client.set('origin@protocol.foo', 123456)

    const response = await request(app)
      .post('/api/attestations/email/verify')
      .send({
        email: 'origin@protocol.foo',
        code: '123456',
        identity: ethAddress
      })
      .expect(200)

    expect(response.body.schemaId).to.equal(
      'https://schema.originprotocol.com/attestation_1.0.0.json'
    )
    expect(response.body.data.issuer.name).to.equal('Origin Protocol')
    expect(response.body.data.issuer.url).to.equal(
      'https://www.originprotocol.com'
    )
    expect(response.body.data.attestation.verificationMethod.email).to.equal(
      true
    )
    expect(response.body.data.attestation.email.verified).to.equal(true)

    // Verify attestation was recorded in the database
    const results = await Attestation.findAll()
    expect(results.length).to.equal(1)
    expect(results[0].ethAddress).to.equal(ethAddress)
    expect(results[0].method).to.equal(AttestationTypes.EMAIL)
    expect(results[0].value).to.equal('origin@protocol.foo')
  })

  it('should error on incorrect verification code', async () => {
    client.set('origin@protocol.foo', '654321')

    const response = await request(app)
      .post('/api/attestations/email/verify')
      .send({
        email: 'origin@protocol.foo',
        code: '123456',
        identity: '0x112234455C3a32FD11230C42E7Bccd4A84e02010'
      })
      .expect(400)

    expect(response.body.errors[0]).to.equal('Verification code is incorrect.')
  })

  it('should error on missing verification code', async () => {
    const response = await request(app)
      .post('/api/attestations/email/verify')
      .send({
        email: 'origin@protocol.foo',
        identity: '0x112234455C3a32FD11230C42E7Bccd4A84e02010'
      })
      .expect(400)

    expect(response.body.errors[0]).to.equal('Field code must not be empty.')
  })

  it('should error on incorrect email format', async () => {
    const response = await request(app)
      .post('/api/attestations/email/verify')
      .send({
        email: 'originprotocol.foo',
        code: '123456',
        identity: '0x112234455C3a32FD11230C42E7Bccd4A84e02010'
      })
      .expect(400)

    expect(response.body.errors[0]).to.equal(
      'Email is not a valid email address.'
    )
  })
})
