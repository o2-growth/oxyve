import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const TITULOS: Array<[RegExp, string]> = [
  [/^\/login/, 'Entrar'],
  [/^\/app\/dashboard/, 'Início'],
  [/^\/app\/expenses/, 'Despesas'],
  [/^\/app\/reports\/[^/]+/, 'Relatório'],
  [/^\/app\/reports/, 'Relatórios'],
  [/^\/app\/gestao/, 'Gestão'],
  [/^\/app\/advances/, 'Adiantamentos'],
  [/^\/app\/settings\/profile/, 'Meus dados'],
  [/^\/app\/settings\/policy/, 'Política de despesa'],
  [/^\/app\/settings\/team/, 'Equipe'],
  [/^\/app\/support/, 'Suporte'],
];

/** Título da aba por rota — com várias abas abertas, todas diziam "Oxy VE". */
export function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const t = TITULOS.find(([re]) => re.test(pathname))?.[1];
    document.title = t ? `${t} · Oxy VE` : 'Oxy VE - Gestão de Despesas';
  }, [pathname]);
}
