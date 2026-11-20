export type IsoDate = string;
export type MonthKey = string;
export type EntryKind = 'EXPENSE' | 'INCOME';
export type SeriesType = 'INSTALLMENT' | 'MONTHLY';
export type SeriesRole = 'NONE' | 'SALARY';
export type EditScope = 'this' | 'following';
export type DeleteScope = 'this' | 'following' | 'series';

export interface PaymentMethodDTO {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  chargeNextMonth: boolean;
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
  tagIds: string[];
  seriesRole: SeriesRole | null;
  amountAdjusted: boolean;
}

export interface TagDTO {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  system: 'SUBSCRIPTION' | null;
}

export interface SalaryDTO {
  seriesId: string;
  amountCents: number;
  dayOfMonth: number;
  paymentMethodId: string | null;
  startMonth: MonthKey;
}

export interface MonthlySeriesDTO {
  id: string;
  name: string;
  kind: EntryKind;
  amountCents: number;
  currentMonthCents: number;
  paymentMethodId: string | null;
  tagIds: string[];
}

export interface Summary {
  expenseCents: number;
  expensePaidCents: number;
  incomeCents: number;
  incomePaidCents: number;
  balanceCents: number;
  realizedCents: number;
}
