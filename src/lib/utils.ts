import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters long.";
  
  const hasAlpha = /[a-zA-Z]/.test(password);
  const hasNum = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  
  if (!hasAlpha || !hasNum || !hasSymbol) {
    return "Password must contain a mixture of letters, numbers, and symbols.";
  }
  
  // Check for consecutive characters (3 or more) in sequence or identical
  for (let i = 0; i < password.length - 2; i++) {
    const char1 = password.charCodeAt(i);
    const char2 = password.charCodeAt(i + 1);
    const char3 = password.charCodeAt(i + 2);
    
    // Check ascending (abc, 123)
    if (char2 === char1 + 1 && char3 === char2 + 1) {
      // Only for letters and numbers
      if (
        ((char1 >= 48 && char1 <= 57) || (char1 >= 65 && char1 <= 90) || (char1 >= 97 && char1 <= 122)) &&
        ((char2 >= 48 && char2 <= 57) || (char2 >= 65 && char2 <= 90) || (char2 >= 97 && char2 <= 122)) &&
        ((char3 >= 48 && char3 <= 57) || (char3 >= 65 && char3 <= 90) || (char3 >= 97 && char3 <= 122))
      ) {
        return "Password cannot contain consecutive letters or numbers (e.g., '123' or 'abc').";
      }
    }
    // Check descending (cba, 321)
    if (char2 === char1 - 1 && char3 === char2 - 1) {
      if (
        ((char1 >= 48 && char1 <= 57) || (char1 >= 65 && char1 <= 90) || (char1 >= 97 && char1 <= 122)) &&
        ((char2 >= 48 && char2 <= 57) || (char2 >= 65 && char2 <= 90) || (char2 >= 97 && char2 <= 122)) &&
        ((char3 >= 48 && char3 <= 57) || (char3 >= 65 && char3 <= 90) || (char3 >= 97 && char3 <= 122))
      ) {
        return "Password cannot contain consecutive letters or numbers in sequence.";
      }
    }
    // Check repeating (aaa, 111)
    if (char1 === char2 && char2 === char3) {
      return "Password cannot contain repeating characters.";
    }
  }
  
  return null;
}
