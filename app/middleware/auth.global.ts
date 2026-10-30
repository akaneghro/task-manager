// Every page needs a session except the login page and public share links (/s/**).

function isPublicRoute(path: string): boolean {
  return path === '/login' || path === '/s' || path.startsWith('/s/')
}

export default defineNuxtRouteMiddleware((to) => {
  if (isPublicRoute(to.path)) return
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) return navigateTo('/login')
})
