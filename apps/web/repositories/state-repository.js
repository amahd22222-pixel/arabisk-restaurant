export function createStateRepository({ orders, customers, reservations, persist }) {
  return {
    orders: {
      all: () => orders,
      findById: (id) => orders.find(item => item.id === id),
      add: (order) => { orders.push(order); persist(); return order; },
      save: () => persist()
    },
    customers: {
      all: () => customers,
      findById: (id) => customers.find(item => item.id === id),
      findByPhone: (phone) => customers.find(item => item.phone === phone),
      add: (customer) => { customers.push(customer); return customer; },
      save: () => persist()
    },
    reservations: {
      all: () => reservations,
      findById: (id) => reservations.find(item => item.id === id),
      findDuplicate: (phone, date, time) => reservations.find(item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time),
      add: (reservation) => { reservations.push(reservation); return reservation; },
      save: () => persist()
    }
  };
}
