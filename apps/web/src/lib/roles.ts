import type { Role } from '@beer/game';

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  retailer: { label: 'Retailer', description: 'Sells to customers, orders from the Wholesaler.' },
  wholesaler: { label: 'Wholesaler', description: 'Supplies the Retailer, orders from the Distributor.' },
  distributor: { label: 'Distributor', description: 'Supplies the Wholesaler, orders from the Factory.' },
  factory: { label: 'Factory', description: 'Supplies the Distributor, brews from raw materials.' },
};
