export type IsoDate = string;
export type MonthKey = string;
export type EntryKind = 'EXPENSE' | 'INCOME';
export type SeriesType = 'INSTALLMENT' | 'MONTHLY';
export type EditScope = 'this' | 'following';
export type DeleteScope = 'this' | 'following' | 'series';

export interface PaymentMethodDTO {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface EntryDTO {
  id: string;
  kind: EntryKind;
  name: string;
  displayName: string;
  amountCents: number;
  dueDate: IsoDate;
  paymentMethodId: string | null;
  pixKey: string | null;
  note: string;
  paidOn: IsoDate | null;
  seriesId: string | null;
  seriesType: SeriesType | null;
  sequence: number | null;
  totalInstallments: number | null;
}

export interface Summary {
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
  realizedCents: number;
}
