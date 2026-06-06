import { ChannelConfig } from '../models/ChannelConfig.js';
import { createCrudRouter } from './crudFactory.js';

export default createCrudRouter(ChannelConfig, {
  resourceName: 'ChannelConfig',
  populate: ['companyId'],
  canWrite: ['ADMIN']
});
