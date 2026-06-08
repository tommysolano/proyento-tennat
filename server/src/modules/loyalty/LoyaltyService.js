import mongoose from 'mongoose';
import { Contact } from '../../models/Contact.js';
import { ConversionEvent } from '../../models/ConversionEvent.js';
import { Coupon } from '../../models/Coupon.js';
import { CouponRedemption } from '../../models/CouponRedemption.js';
import { Referral } from '../../models/Referral.js';
import { ReferralProgram } from '../../models/ReferralProgram.js';
import { User } from '../../models/User.js';
import { recordActivity } from '../../utils/activity.js';
import { checkPlatformLimit } from '../../utils/platformLimits.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import { EMAIL_PATTERN } from '../../utils/validation.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { WorkflowEventEmitter } from '../workflows/WorkflowEventEmitter.js';
import { checkModuleAccess } from '../../middleware/moduleMiddleware.js';
import { assertContactAccess } from '../reputation/reputationScope.js';
import {
  createReferralCode,
  publicSlug,
  sanitizeReputationText,
  sanitizeReputationValue
} from '../reputation/reputationSecurity.js';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, retryable: false });
}

async function notifyAdmins(input) {
  const users = await User.find({ companyId: input.companyId, role: 'ADMIN', status: 'active' }).select('_id');
  await Promise.all(users.map((user) => NotificationService.create({ ...input, userId: user._id })));
}

export class LoyaltyService {
  static async createCoupon({ actor, body }) {
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'coupons'
    });
    const coupon = await Coupon.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      code: String(body.code || '').trim().toUpperCase(),
      name: body.name,
      description: body.description,
      discountType: body.discountType || 'custom',
      discountValue: Number(body.discountValue || 0),
      currency: body.currency || 'USD',
      status: body.status === 'active' ? 'active' : 'draft',
      startsAt: body.startsAt || null,
      expiresAt: body.expiresAt || null,
      maxRedemptions: Number(body.maxRedemptions || 0),
      perContactLimit: Number(body.perContactLimit || 1),
      applicableTo: body.applicableTo || {},
      metadata: body.metadata || {},
      createdBy: actor._id
    });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'coupon_created',
        summary: `Cupon creado: ${coupon.code}`,
        metadata: { couponId: coupon._id }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'coupons',
        metadata: { couponId: coupon._id }
      })
    ]);
    return coupon;
  }

  static assertCouponAvailable(coupon) {
    const now = new Date();
    if (coupon.status !== 'active') throw badRequest('El cupon no esta activo');
    if (coupon.startsAt && coupon.startsAt > now) throw badRequest('El cupon aun no esta vigente');
    if (coupon.expiresAt && coupon.expiresAt <= now) throw badRequest('El cupon expiro');
    if (coupon.maxRedemptions > 0 && coupon.usageCount >= coupon.maxRedemptions) {
      throw badRequest('El cupon alcanzo su limite de redenciones');
    }
  }

  static async issueCoupon({ actor, coupon, contactId, source = 'manual', metadata = {} }) {
    this.assertCouponAvailable(coupon);
    const contact = await assertContactAccess(actor, contactId);
    const existing = await CouponRedemption.countDocuments({
      companyId: actor.companyId,
      couponId: coupon._id,
      contactId: contact._id,
      status: { $in: ['issued', 'redeemed'] }
    });
    if (existing >= coupon.perContactLimit) throw badRequest('El contacto alcanzo el limite del cupon');
    const redemption = await CouponRedemption.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      couponId: coupon._id,
      contactId: contact._id,
      code: coupon.code,
      status: 'issued',
      source,
      metadata: sanitizeReputationValue(metadata)
    });
    await recordActivity({
      user: actor,
      type: 'coupon_issued',
      summary: `Cupon ${coupon.code} emitido a ${contact.name}`,
      metadata: { couponId: coupon._id, couponRedemptionId: redemption._id, contactId: contact._id }
    });
    return redemption;
  }

  static async redeemCoupon({ actor, coupon, contactId, redemptionId = null, metadata = {} }) {
    this.assertCouponAvailable(coupon);
    const contact = await assertContactAccess(actor, contactId);
    let redemption = redemptionId
      ? await CouponRedemption.findOne({
          _id: redemptionId,
          companyId: actor.companyId,
          couponId: coupon._id,
          contactId: contact._id
        })
      : await CouponRedemption.findOne({
          companyId: actor.companyId,
          couponId: coupon._id,
          contactId: contact._id,
          status: 'issued'
        }).sort({ createdAt: 1 });
    if (!redemption) {
      redemption = await this.issueCoupon({ actor, coupon, contactId, metadata });
    }
    if (redemption.status !== 'issued') throw badRequest('La emision no puede redimirse');
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'coupon_redemptions'
    });
    redemption.status = 'redeemed';
    redemption.redeemedAt = new Date();
    redemption.redeemedBy = actor._id;
    redemption.metadata = { ...(redemption.metadata || {}), ...sanitizeReputationValue(metadata) };
    await redemption.save();
    coupon.usageCount += 1;
    await coupon.save();
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'coupon_redeemed',
        summary: `Cupon ${coupon.code} redimido por ${contact.name}`,
        metadata: { couponId: coupon._id, couponRedemptionId: redemption._id, contactId: contact._id }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'coupon_redemptions',
        metadata: { couponId: coupon._id, couponRedemptionId: redemption._id }
      }),
      ConversionEvent.create({
        companyId: actor.companyId,
        distributorId: actor.distributorId || null,
        type: 'coupon_redemption',
        contactId: contact._id,
        metadata: { couponId: coupon._id, couponRedemptionId: redemption._id }
      }),
      notifyAdmins({
        companyId: actor.companyId,
        distributorId: actor.distributorId || null,
        type: 'coupon_redeemed',
        title: 'Cupon redimido',
        body: `${coupon.code} - ${contact.name}`,
        relatedType: 'coupon_redemption',
        relatedId: redemption._id,
        metadata: { couponId: coupon._id, contactId: contact._id }
      })
    ]);
    return redemption;
  }

  static async cancelRedemption({ actor, redemption }) {
    if (redemption.status !== 'issued') throw badRequest('Solo una emision pendiente puede cancelarse');
    redemption.status = 'cancelled';
    await redemption.save();
    await recordActivity({
      user: actor,
      type: 'coupon_redemption_cancelled',
      summary: `Emision de cupon cancelada: ${redemption.code}`,
      metadata: {
        couponId: redemption.couponId,
        couponRedemptionId: redemption._id,
        contactId: redemption.contactId
      }
    });
    return redemption;
  }

  static async createReferralProgram({ actor, body }) {
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'referral_programs'
    });
    const program = await ReferralProgram.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      name: body.name,
      slug: publicSlug(body.slug || body.name),
      status: body.status === 'active' ? 'active' : 'draft',
      rewardDescription: body.rewardDescription,
      referrerReward: body.referrerReward,
      refereeReward: body.refereeReward,
      settings: body.settings || {},
      createdBy: actor._id,
      metadata: body.metadata || {}
    });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'referral_program_created',
        summary: `Programa de referidos creado: ${program.name}`,
        metadata: { referralProgramId: program._id }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'referral_programs',
        metadata: { referralProgramId: program._id }
      })
    ]);
    return program;
  }

  static async createReferral({ actor, program, body }) {
    if (!['active', 'draft'].includes(program.status)) throw badRequest('Programa no disponible');
    const referrer = await assertContactAccess(actor, body.referrerContactId);
    let referredContactId = null;
    if (body.referredContactId) {
      referredContactId = (await assertContactAccess(actor, body.referredContactId))._id;
    }
    await checkUsageLimit({
      companyId: actor.companyId,
      distributorId: actor.distributorId,
      metric: 'referrals'
    });
    const referral = await Referral.create({
      companyId: actor.companyId,
      distributorId: actor.distributorId || null,
      referralProgramId: program._id,
      referrerContactId: referrer._id,
      referredContactId,
      code: body.code || createReferralCode(),
      status: referredContactId ? 'submitted' : 'invited',
      source: body.source || 'manual',
      rewardStatus: 'pending',
      metadata: body.metadata || {}
    });
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'referral_created',
        summary: `Referido creado para ${referrer.name}`,
        metadata: {
          referralId: referral._id,
          referralProgramId: program._id,
          contactId: referrer._id,
          referrerContactId: referrer._id,
          referredContactId
        }
      }),
      trackUsage({
        companyId: actor.companyId,
        distributorId: actor.distributorId,
        metric: 'referrals',
        metadata: { referralId: referral._id, referralProgramId: program._id }
      })
    ]);
    return referral;
  }

  static async publicReferral(programSlug, code) {
    const program = await ReferralProgram.findOne({
      slug: publicSlug(programSlug),
      status: 'active'
    }).lean();
    if (!program) return null;
    const [loyalty, referrals] = await Promise.all([
      checkModuleAccess('loyalty', {
        role: 'ADMIN',
        companyId: program.companyId,
        distributorId: program.distributorId
      }),
      checkModuleAccess('referrals', {
        role: 'ADMIN',
        companyId: program.companyId,
        distributorId: program.distributorId
      })
    ]);
    if (!loyalty.enabled || !referrals.enabled) return null;
    const referral = await Referral.findOne({
      referralProgramId: program._id,
      code: String(code || '').trim().toUpperCase(),
      status: { $in: ['invited', 'submitted'] }
    }).lean();
    if (!referral) return null;
    return {
      program: {
        name: program.name,
        slug: program.slug,
        rewardDescription: program.rewardDescription,
        refereeReward: program.refereeReward
      },
      code: referral.code,
      status: referral.status
    };
  }

  static async submitPublicReferral({ programSlug, code, body, tracking }) {
    const program = await ReferralProgram.findOne({
      slug: publicSlug(programSlug),
      status: 'active'
    });
    if (!program) throw Object.assign(new Error('Programa no disponible'), { status: 404 });
    const enabled = await this.publicReferral(programSlug, code);
    if (!enabled) throw Object.assign(new Error('Programa no disponible'), { status: 404 });
    const referral = await Referral.findOne({
      companyId: program.companyId,
      referralProgramId: program._id,
      code: String(code || '').trim().toUpperCase(),
      status: { $in: ['invited', 'submitted'] }
    });
    if (!referral) throw Object.assign(new Error('Codigo de referido no disponible'), { status: 404 });
    const name = sanitizeReputationText(body.name, 160);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = sanitizeReputationText(body.phone, 80);
    if (!name || (!email && !phone)) throw badRequest('name y email o phone son requeridos');
    if (email && !EMAIL_PATTERN.test(email)) throw badRequest('email invalido');
    let contact = await Contact.findOne({
      companyId: program.companyId,
      archivedAt: null,
      $or: [email ? { email } : null, phone ? { phone } : null].filter(Boolean)
    });
    const actor = await User.findOne({
      companyId: program.companyId,
      role: 'ADMIN',
      status: 'active'
    }).sort({ createdAt: 1 });
    if (!actor) throw Object.assign(new Error('La empresa no tiene administrador activo'), { status: 503 });
    if (!contact) {
      await checkPlatformLimit(program.distributorId, 'contacts');
      contact = await Contact.create({
        companyId: program.companyId,
        distributorId: program.distributorId,
        name,
        fullName: name,
        email,
        phone,
        source: `Referido: ${program.name}`,
        createdBy: actor._id,
        updatedBy: actor._id,
        metadata: { referralId: referral._id, referralProgramId: program._id }
      });
    }
    referral.referredContactId = contact._id;
    referral.status = 'submitted';
    referral.source = 'public_referral';
    referral.metadata = {
      ...(referral.metadata || {}),
      ipHash: tracking.ipHash,
      userAgent: tracking.userAgent,
      referrer: tracking.referrer
    };
    await referral.save();
    await ConversionEvent.create({
      companyId: program.companyId,
      distributorId: program.distributorId,
      type: 'referral_submission',
      contactId: contact._id,
      metadata: { referralId: referral._id, referralProgramId: program._id }
    });
    return { success: true, status: referral.status };
  }

  static async markReferralConverted({ actor, referral }) {
    if (!['submitted', 'invited'].includes(referral.status)) throw badRequest('El referido no puede convertirse');
    referral.status = 'converted';
    referral.convertedAt = new Date();
    await referral.save();
    await Promise.all([
      recordActivity({
        user: actor,
        type: 'referral_converted',
        summary: 'Referido marcado como convertido',
        metadata: {
          referralId: referral._id,
          referralProgramId: referral.referralProgramId,
          contactId: referral.referrerContactId,
          referrerContactId: referral.referrerContactId,
          referredContactId: referral.referredContactId
        }
      }),
      notifyAdmins({
        companyId: actor.companyId,
        distributorId: actor.distributorId || null,
        type: 'referral_converted',
        title: 'Referido convertido',
        body: `Codigo ${referral.code}`,
        relatedType: 'referral',
        relatedId: referral._id,
        metadata: {
          referrerContactId: referral.referrerContactId,
          referredContactId: referral.referredContactId
        }
      })
    ]);
    return referral;
  }

  static async rewardReferral({ actor, referral, rewardStatus = 'approved' }) {
    if (!['approved', 'paid_manually', 'cancelled'].includes(rewardStatus)) {
      throw badRequest('rewardStatus invalido');
    }
    referral.rewardStatus = rewardStatus;
    if (rewardStatus === 'paid_manually') {
      referral.status = 'rewarded';
      referral.rewardedAt = new Date();
    }
    await referral.save();
    await recordActivity({
      user: actor,
      type: 'referral_rewarded',
      summary: `Recompensa de referido: ${rewardStatus}`,
      metadata: {
        referralId: referral._id,
        referralProgramId: referral.referralProgramId,
        contactId: referral.referrerContactId,
        rewardStatus
      }
    });
    return referral;
  }

  static async calculateLoyaltyMetrics(companyId, resourceScope = null) {
    const companyFilter = companyId ? { companyId } : {};
    const contactIds = resourceScope?.contactId?.$in || null;
    const redemptionFilter = contactIds
      ? { ...companyFilter, contactId: { $in: contactIds } }
      : companyFilter;
    const referralFilter = contactIds
      ? {
          ...companyFilter,
          $or: [
            { referrerContactId: { $in: contactIds } },
            { referredContactId: { $in: contactIds } }
          ]
        }
      : companyFilter;
    const [coupons, redeemed, referrals, converted] = await Promise.all([
      CouponRedemption.countDocuments(redemptionFilter),
      CouponRedemption.countDocuments({ ...redemptionFilter, status: 'redeemed' }),
      Referral.countDocuments(referralFilter),
      Referral.countDocuments({
        ...referralFilter,
        status: { $in: ['converted', 'rewarded'] }
      })
    ]);
    return {
      couponsIssued: coupons,
      couponsRedeemed: redeemed,
      redemptionRate: coupons ? Number(((redeemed / coupons) * 100).toFixed(2)) : 0,
      referralsCreated: referrals,
      referralsConverted: converted
    };
  }
}
