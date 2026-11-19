import { expect, test } from 'vitest';
import { formatBRL, parseBRL } from '../src/money';

test.each([
  ['R$ 630,00', 63000], ['R$ 1.234,56', 123456], ['1.234,56', 123456],
  ['1234,56', 123456], ['1234.56', 123456], ['R$ 7', 700], ['7', 700],
  ['42,9', 4290], ['  81,75 ', 8175], ['0,01', 1],
])('parseBRL(%j) === %i', (input, cents) => expect(parseBRL(input)).toBe(cents));

test.each(['', 'abc', 'R$', '12,345', '1,2,3', '-'])('parseBRL(%j) === null', (input) =>
  expect(parseBRL(input)).toBeNull());

test('formatBRL', () => {
  expect(formatBRL(171796)).toBe('R$ 1.717,96');
  expect(formatBRL(700)).toBe('R$ 7,00');
  expect(formatBRL(-2500)).toBe('-R$ 25,00');
});
