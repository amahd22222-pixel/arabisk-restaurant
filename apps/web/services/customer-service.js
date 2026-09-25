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

    if (body?.internalNotes !== undefined) {
      customer.internalNotes = cleanText(body.internalNotes, 2000);
      customer.internalNotesUpdatedAt = new Date().toISOString();
    }

    await customers.save();

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
