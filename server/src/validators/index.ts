export * from './auth';

export const createBorrowerSchema = {
  firstName: { required: true, type: 'string' },
  lastName: { required: true, type: 'string' },
  mobile: { required: true, type: 'string' },
  email: { required: false, type: 'email' },
  dateOfBirth: { required: false, type: 'date' },
  gender: { required: false, type: 'string' },
  presentAddress: { required: false, type: 'string' },
  employmentStatus: { required: false, type: 'string' },
  monthlyIncome: { required: false, type: 'number' },
};

export const createLoanProductSchema = {
  name: { required: true, type: 'string' },
  interestType: { required: true, type: 'string' },
  interestRate: { required: true, type: 'number' },
  minAmount: { required: true, type: 'number' },
  maxAmount: { required: true, type: 'number' },
  minTerm: { required: true, type: 'number' },
  maxTerm: { required: true, type: 'number' },
};

export const createApplicationSchema = {
  borrowerId: { required: true, type: 'string' },
  loanProductId: { required: true, type: 'string' },
  principalAmount: { required: true, type: 'number' },
  termMonths: { required: true, type: 'number' },
  paymentFrequency: { required: true, type: 'string' },
};

export const createPaymentSchema = {
  loanId: { required: true, type: 'string' },
  amount: { required: true, type: 'number' },
  paymentMethod: { required: true, type: 'string' },
  paymentDate: { required: true, type: 'string' },
};
