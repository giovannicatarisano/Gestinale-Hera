# Auth Testing

## Credentials
- Admin: admin@hera.it / admin123
- Driver: mario.rossi@hera.it / autista123

## API test
```
curl -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@hera.it","password":"admin123"}'
# -> { token, user }

TOKEN=<token from above>
curl http://localhost:8001/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Auth uses JWT Bearer tokens (localStorage on frontend). bcrypt password hashing.
