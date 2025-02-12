#include <vector>
#include <string>

using namespace std;

void validateEmails(const vector<string>& emails, 
                   vector<string>& valid,
                   vector<string>& invalid) {
    
    valid.clear();
    invalid.clear();
    
    for(const string& email : emails) {
        size_t atPos = email.find('@');
        bool isValid = false;
        
        if(atPos != string::npos && 
           email.find('@', atPos + 1) == string::npos && // only one @
           atPos > 0 && // has text before @
           atPos < email.length() - 1) { // has text after @
            isValid = true;
        }
        
        if(isValid) {
            valid.push_back(email);
        } else {
            invalid.push_back(email);
        }
    }
}
