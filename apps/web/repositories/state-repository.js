import { createCollectionRepository } from './collection-repository.js';

const cleanIdempotencyKey = (value) => String(value ?? '').trim().slice(0, 100);

export function createStateRepository({ products, categories, orders, customers, reservations, pushSubscriptions, persist }) {
  const productRepository = createCollectionRepository(products, { persist });
  const categoryRepository = createCollectionRepository(categories, { persist });
  const orderRepository = createCollectionRepository(orders, { persist });
  const customerRepository = createCollectionRepository(customers, { persist });
  const reservationRepository = createCollectionRepository(reservations, { persist });
  const pushSubscriptionRepository = createCollectionRepository(pushSubscriptions, { persist });

  return {
    products: productRepository,
    categories: categoryRepository,
    orders: {
      ...orderRepository,
      findByIdempotencyKey: (key) => orderRepository.find(
        item => cleanIdempotencyKey(item?.idempotencyKey) === cleanIdempotencyKey(key)
      )
    },
    customers: {
      ...customerRepository,
      findByPhone: (phone) => customerRepository.find(item => item.phone === phone)
    },
    reservations: {
      ...reservationRepository,
      findByIdempotencyKey: (key) => reservationRepository.find(
        item => cleanIdempotencyKey(item?.idempotencyKey) === cleanIdempotencyKey(key)
      ),
      findDuplicate: (phone, date, time) => reservationRepository.find(
        item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time
      )
    },
    pushSubscriptions: pushSubscriptionRepository
  };
}
