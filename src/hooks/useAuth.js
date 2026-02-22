import { jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
const AuthContext = createContext(undefined);
const rolePriority = ['super_admin', 'gestor', 'bibliotecaria', 'professor', 'aluno'];
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(null);
    const [roles, setRoles] = useState([]);
    useEffect(() => {
        // Set up auth state listener FIRST
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            // Defer role fetching with setTimeout to avoid deadlock
            if (session?.user) {
                setTimeout(() => {
                    fetchUserRole(session.user.id);
                }, 0);
            }
            else {
                setUserRole(null);
                setRoles([]);
            }
        });
        // THEN check for existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserRole(session.user.id);
            }
            setLoading(false);
        });
        return () => subscription.unsubscribe();
    }, []);
    const fetchUserRole = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', userId);
            if (error) {
                console.error('Error fetching user role:', error);
                return;
            }
            const userRoles = [...new Set((data || []).map((item) => item.role))];
            setRoles(userRoles);
            const pickedRole = rolePriority.find((role) => userRoles.includes(role)) || null;
            setUserRole(pickedRole);
        }
        catch (error) {
            console.error('Error fetching user role:', error);
        }
    };
    const signIn = async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    };
    const signUp = async (email, password, nome) => {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: redirectUrl,
                data: { nome }
            }
        });
        return { error };
    };
    const signOut = async () => {
        await supabase.auth.signOut();
        setUserRole(null);
    };
    const isGestor = userRole === 'gestor';
    const isProfessor = userRole === 'professor';
    const isBibliotecaria = userRole === 'bibliotecaria';
    const isAluno = userRole === 'aluno';
    const isSuperAdmin = userRole === 'super_admin';
    return (_jsx(AuthContext.Provider, { value: {
            user,
            session,
            loading,
            userRole,
            roles,
            isGestor,
            isProfessor,
            isBibliotecaria,
            isAluno,
            isSuperAdmin,
            signIn,
            signUp,
            signOut
        }, children: children }));
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
