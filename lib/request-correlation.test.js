import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getParentRequestId } from './request-correlation.js'

test('getParentRequestId reads the Breadcrum correlation header', () => {
  assert.equal(getParentRequestId({
    'x-breadcrum-request-id': 'breadcrum-request-123',
  }), 'breadcrum-request-123')
})

test('getParentRequestId returns the first repeated header value', () => {
  assert.equal(getParentRequestId({
    'x-breadcrum-request-id': ['breadcrum-request-123', 'breadcrum-request-456'],
  }), 'breadcrum-request-123')
})

test('getParentRequestId returns undefined when the header is absent', () => {
  assert.equal(getParentRequestId({}), undefined)
})
