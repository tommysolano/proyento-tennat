import { Company } from '../models/Company.js';
import { Contact } from '../models/Contact.js';
import { Distributor } from '../models/Distributor.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';

export async function refreshDistributorOnboarding(distributorId) {
  const distributor = await Distributor.findById(distributorId);
  if (!distributor) return null;

  const [firstPlan, firstCompany, firstAdmin, firstSubscription] = await Promise.all([
    Plan.exists({ distributorId }),
    Company.exists({ distributorId }),
    User.exists({ distributorId, role: 'ADMIN' }),
    Subscription.exists({ distributorId })
  ]);

  const steps = {
    profile: Boolean(distributor.name && distributor.ownerName && distributor.email),
    branding: Boolean(distributor.branding?.companyName || distributor.branding?.logoUrl),
    firstPlan: Boolean(firstPlan),
    firstCompany: Boolean(firstCompany),
    firstAdmin: Boolean(firstAdmin),
    firstSubscription: Boolean(firstSubscription)
  };

  distributor.onboarding = {
    completed: Object.values(steps).every(Boolean),
    steps
  };
  await distributor.save();
  return distributor.onboarding;
}

export async function refreshCompanyOnboarding(companyId) {
  const company = await Company.findById(companyId);
  if (!company) return null;

  const [internalUser, contact, assignedContact] = await Promise.all([
    User.exists({ companyId, role: { $in: ['SUPERVISOR', 'CALLCENTER'] } }),
    Contact.exists({ companyId }),
    Contact.exists({ companyId, assignedTo: { $ne: null } })
  ]);

  const steps = {
    profile: Boolean(
      company.onboarding?.steps?.profile ||
        (company.name && company.taxId && company.industry)
    ),
    users: Boolean(internalUser),
    contacts: Boolean(contact),
    firstAssignment: Boolean(assignedContact)
  };

  company.onboarding = {
    completed: Object.values(steps).every(Boolean),
    steps
  };
  await company.save();
  return company.onboarding;
}
