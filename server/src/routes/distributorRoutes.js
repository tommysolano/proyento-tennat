import { Distributor } from '../models/Distributor.js';
import { createCrudRouter } from './crudFactory.js';

export default createCrudRouter(Distributor, {
  resourceName: 'Distributor',
  canWrite: []
});
