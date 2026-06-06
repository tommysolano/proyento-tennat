import { Company } from '../models/Company.js';
import { Distributor } from '../models/Distributor.js';

export async function buildSessionTenant(user) {
  const [distributor, company] = await Promise.all([
    user.distributorId
      ? Distributor.findById(user.distributorId)
          .select('name slug status branding customDomain settings billingSettings onboarding')
          .lean()
      : null,
    user.companyId
      ? Company.findById(user.companyId)
          .select('name status industry taxId settings onboarding distributorId')
          .lean()
      : null
  ]);

  return { distributor, company };
}
