import { describe, it, expect } from 'vitest'
import { friendlyContractError } from './genlayer.js'

// A real captured GenLayer RPC error: the raw message is a Go %v struct dump
// where the contract's UserError code (here "POLICY_NOT_FOUND") is encoded
// as a comma-separated list of hex byte values inside a `ReturnData:[]uint8{...}`
// field, not as literal text.
const RAW_POLICY_NOT_FOUND_ERROR = {
  message:
    'Missing or invalid parameters. Details: execution failed: &genvm.VMResult{Kind:0x1, ' +
    'ReturnData:[]uint8{0x2e, 0x4, 0x64, 0x61, 0x74, 0x61, 0x84, 0x1, 0x50, 0x4f, 0x4c, 0x49, ' +
    '0x43, 0x59, 0x5f, 0x4e, 0x4f, 0x54, 0x5f, 0x46, 0x4f, 0x55, 0x4e, 0x44, 0x6, 0x65, 0x76, ' +
    '0x65, 0x6e, 0x74, 0x73}: genvm execution error',
}

describe('friendlyContractError', () => {
  it('decodes a hex-byte-encoded UserError code and maps it to friendly copy', () => {
    const result = friendlyContractError(RAW_POLICY_NOT_FOUND_ERROR)
    expect(result.message).toBe('That policy could not be found.')
  })

  it('falls back to a humanized version of an unmapped error code', () => {
    const err = { message: 'ReturnData:[]uint8{0x53, 0x4f, 0x4d, 0x45, 0x5f, 0x4e, 0x45, 0x57, 0x5f, 0x43, 0x4f, 0x44, 0x45}' }
    // bytes spell "SOME_NEW_CODE"
    const result = friendlyContractError(err)
    expect(result.message).toBe('some new code')
  })

  it('passes through a plain Error unchanged when no code can be extracted', () => {
    const err = new Error('Network request failed')
    const result = friendlyContractError(err)
    expect(result.message).toBe('Network request failed')
  })

  it('wraps a non-Error thrown value in an Error', () => {
    const result = friendlyContractError('just a string')
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('just a string')
  })
})
