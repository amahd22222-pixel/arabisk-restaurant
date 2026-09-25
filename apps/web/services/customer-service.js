export function createCustomerService({ repository, cleanText }) {
  const { customers } = repository;

  function listCustomers() {
    return customers.all();
  }

  async function updateCustomer(id, body) {
    const customer = customers.findById(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.status = 404;
      throw error;
    }

    const before = structuredClone(customer);

    if (body?.internalNotes !== undefined) {
      customer.internalNotes = cleanText(body.internalNotes, 2000);
      customer.internalNotesUpdatedAt = new Date().toISOString();
    }

    try {
      await customers.save();
    } catch (error) {
      Object.assign(customer, before);
      throw error;
    }

    return {
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      internalNotes: customer.internalNotes || '',
      internalNotesUpdatedAt: customer.internalNotesUpdatedAt || ''
    };
  }

  return { listCustomers, updateCustomer };
}
