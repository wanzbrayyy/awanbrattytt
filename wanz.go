#include <iostream>
#include <string>

void sapa(const std::string& nama) {
    std::cout << "Halo, " << nama << "!" << std::endl;
}

int main() {
    std::string nama;
    std::cout << "Masukkan nama kamu: ";
    std::getline(std::cin, nama);
    sapa(nama);
    return 0;
}

