import { OpenAPIV3 } from 'openapi-types';

/**
 * Minimal OpenAPI specification for the Library Management API.
 */
export const openApiSpec: OpenAPIV3.Document = {
  openapi: '3.0.1',
  info: {
    title: 'Library Management API',
    version: '1.0.0',
    description: 'REST API for managing library resources, loans, reservations, and fines.'
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register member',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  name: { type: 'string' },
                  address: { type: 'string' }
                },
                required: ['username', 'email', 'password', 'name']
              }
            }
          }
        },
        responses: {
          201: { description: 'Registered' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' }
                },
                required: ['username', 'password']
              }
            }
          }
        },
        responses: {
          200: { description: 'Authenticated' }
        }
      }
    },
    '/auth/me': {
      get: {
        summary: 'Get current user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Profile' }
        }
      }
    },
    '/books': {
      get: {
        summary: 'List books',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Books' } }
      },
      post: {
        summary: 'Create book (Admin)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' } }
      }
    },
    '/books/{isbn}': {
      get: {
        summary: 'Get book by ISBN',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'isbn', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Book' } }
      },
      patch: {
        summary: 'Update book (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'isbn', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } }
      },
      delete: {
        summary: 'Delete book (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'isbn', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } }
      }
    },
    '/authors': {
      get: { summary: 'List authors', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Authors' } } },
      post: { summary: 'Create author (Admin)', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } }
    },
    '/authors/{id}': {
      patch: {
        summary: 'Update author (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } }
      },
      delete: {
        summary: 'Delete author (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } }
      }
    },
    '/publishers': {
      get: { summary: 'List publishers', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Publishers' } } },
      post: { summary: 'Create publisher (Admin)', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Created' } } }
    },
    '/publishers/{id}': {
      patch: {
        summary: 'Update publisher (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Updated' } }
      },
      delete: {
        summary: 'Delete publisher (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted' } }
      }
    },
    '/loans/borrow': {
      post: { summary: 'Borrow book (Member)', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Loan created' } } }
    },
    '/loans/return': {
      post: { summary: 'Return book', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Returned' } } }
    },
    '/loans/me': {
      get: { summary: 'List my loans', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Loans' } } }
    },
    '/reservations': {
      post: { summary: 'Create reservation (Member)', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Reserved' } } }
    },
    '/reservations/{id}/cancel': {
      patch: {
        summary: 'Cancel reservation (Member)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Cancelled' } }
      }
    },
    '/reservations/me': {
      get: { summary: 'List my reservations', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Reservations' } } }
    },
    '/fines/me': {
      get: { summary: 'List my fines', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Fines' } } }
    },
    '/fines/{id}/pay': {
      patch: {
        summary: 'Pay fine',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Paid' } }
      }
    },
    '/admin/dashboard': {
      get: {
        summary: 'Admin dashboard',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Metrics' } }
      }
    }
  }
};
