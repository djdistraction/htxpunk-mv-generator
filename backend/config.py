from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str
    replicate_api_token: str
    runwayml_api_secret: str
    supabase_url: str
    supabase_service_key: str
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str = "voodoo-hut-assets"
    r2_public_url: str
    redis_url: str = "redis://localhost:6379"
    app_env: str = "development"
    secret_key: str
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = "../.env"


settings = Settings()
