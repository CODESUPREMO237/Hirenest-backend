FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npm run start --if-present; if [ $? -ne 0 ]; then npm run dev --if-present; fi; if [ $? -ne 0 ]; then node .; fi"]
