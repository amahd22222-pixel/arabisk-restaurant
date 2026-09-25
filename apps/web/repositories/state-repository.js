import { createCollectionRepository } from './collection-repository.js';

export function createStateRepository({ products, orders, customers, reservations, persist }) {
  const productRepository = createCollectionRepository(products, { persist });
  const orderRepository = createCollectionRepository(orders, { persist });
  const customerRepository = createCollectionRepository(customers, { persist });
  const reservationRepository = createCollectionRepository(reservations, { persist });

  return {
    products: productRepository,
    orders: orderRepository,
    customers: {
      ...customerRepository,
      findByPhone: (phone) => customers.find(item => item.phone === phone)
    },
    reservations: {
      ...reservationRepository,
      findDuplicate: (phone, date, time) => reservations.find(
        item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time
      )
    }
  };
}
