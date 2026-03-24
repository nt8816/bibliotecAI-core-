import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AdminAcesso() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate(
      {
        pathname: '/auth',
        search: location.search,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.search, navigate]);

  return null;
}
