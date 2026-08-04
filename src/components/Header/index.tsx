import type { PropsWithChildren } from 'react'
import type React from 'react'

const Header: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <header className="container z-20 mx-auto w-full px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex w-full flex-col items-center justify-between space-y-3">
        <nav className="glass-card flex w-auto content-center items-center justify-end space-x-2 px-4 py-2 sm:space-x-3 sm:px-5 sm:py-2.5">
          {children}
        </nav>
      </div>
    </header>
  )
}

export default Header
