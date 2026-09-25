import { createCollectionRepository } from './collection-repository.js';

export function createStateRepository({ products, categories, orders, customers, reservations, persist }) {
  const productRepository = createCollectionRepository(products, { persist });
  const categoryRepository = createCollectionRepository(categories, { persist });
  const orderRepository = createCollectionRepository(orders, { persist });
  const customerRepository = createCollectionRepository(customers, { persist });
  const reservationRepository = createCollectionRepository(reservations, { persist });

  return {
    products: productRepository,
    categories: categoryRepository,
    orders: orderRepository,
    customers: {
      ...customerRepository,
      findByPhone: (phone) => customerRepository.find(item => item.phone === phone)
    },
    reservations: {
      ...reservationRepository,
      findDuplicate: (phone, date, time) => reservationRepository.find(
        item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time
      )
    }
  };
}
