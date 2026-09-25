import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { O2Rings } from "@/components/brand/O2Rings";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404: rota inexistente:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center text-center">
        <O2Rings wireframe size={96} className="opacity-40" />
        <p className="o2-eyebrow mt-6">Erro 404</p>
        <h1 className="o2-display mt-2 text-3xl text-foreground">Página não encontrada</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          O endereço <code className="o2-num">{location.pathname}</code> não existe no Oxy VE.
        </p>
        <Link
          to="/app/dashboard"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
