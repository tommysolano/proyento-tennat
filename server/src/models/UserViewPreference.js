import mongoose from 'mongoose';

const userViewPreferenceSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    module: {
      type: String,
      enum: ['contacts', 'opportunities'],
      required: true
    },
    view: {
      type: String,
      enum: ['list'],
      default: 'list'
    },
    visibleColumns: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

userViewPreferenceSchema.index(
  { companyId: 1, userId: 1, module: 1, view: 1 },
  { unique: true }
);

export const UserViewPreference = mongoose.model(
  'UserViewPreference',
  userViewPreferenceSchema
);
