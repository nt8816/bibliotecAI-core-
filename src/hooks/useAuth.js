import { jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchPlatformCurrentRoles, fetchPlatformSessionProfile, signInWithPlatform, signOutWithPlatform, signUpWithPlatform } from '@/services/authService';
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
                    fetchUserRole(session.user.id, session.user.email);
                }, 0);
            }
            else {
                setUserRole(null);
                setRoles([]);
            }
        });
        // THEN check for existing session
        fetchPlatformSessionProfile()
            .then(({ session, user, roles }) => {
            setSession(session);
            setUser(user ?? null);
            if (user?.id) {
                const uniqueRoles = [...new Set(roles || [])];
                setRoles(uniqueRoles);
                setUserRole(rolePriority.find((role) => uniqueRoles.includes(role)) || null);
                if (uniqueRoles.length === 0) {
                    fetchUserRole(user.id, user.email);
                }
            }
        })
            .finally(() => {
            setLoading(false);
        });
        return () => subscription.unsubscribe();
    }, []);
    const fetchUserRole = async (userId, userEmail) => {
        try {
            const userRoles = await fetchPlatformCurrentRoles();
            setRoles(userRoles);
            const pickedRole = rolePriority.find((role) => userRoles.includes(role)) || null;
            setUserRole(pickedRole);
        }
        catch (error) {
            console.error('Error fetching user role:', error);
        }
    };
    const signIn = async (email, password) => {
        const { error } = await signInWithPlatform(email, password);
        return { error };
    };
    const signUp = async (email, password, nome) => {
        const { error } = await signUpWithPlatform(email, password, nome);
        return { error };
    };
    const signOut = async () => {
        await signOutWithPlatform();
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
