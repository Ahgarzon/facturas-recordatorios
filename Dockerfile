FROM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Facturas.Api/Facturas.Api.csproj src/Facturas.Api/
RUN dotnet restore src/Facturas.Api/Facturas.Api.csproj
COPY src/Facturas.Api/ src/Facturas.Api/
COPY --from=web /src/web/dist/ src/Facturas.Api/wwwroot/
RUN dotnet publish src/Facturas.Api/Facturas.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /out/ ./
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Facturas.Api.dll"]
