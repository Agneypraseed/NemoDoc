FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/prepare-pdf-assets.mjs scripts/prepare-pdf-assets.mjs
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY package.json ./
RUN mkdir data && chown node:node data
USER node
EXPOSE 3001
CMD ["npm","start"]
